use serde_json::Value;

use crate::capabilities::get_paragraph::{
    Completeness, ContentMetadata, GetParagraphPayload, GetParagraphRequest, GetParagraphResult,
    Paragraph, ParagraphReferences, ParagraphWarning, ParagraphWarningCode, ResultMetadata,
    SourceBehavior, SourceMetadata,
};
use crate::capabilities::validation::is_url_dot_segment;
use crate::http::{CancellationToken, HttpTransport};
use crate::{KasbError, KasbFailure, KasbFailureCode};

use super::decode::{
    optional_number, required_array, required_object, source_changed, to_string_value,
};
use super::normalize::normalize_kasb_plain_text;
use super::structure::{SectionEnrichment, section_enrichment};
use super::transport::fetch_json;
use super::urls::{KASB_API_BASE_URL, paragraph_content_url};

const METADATA_WARNING: &str =
    "Could not fully verify parent standard/section metadata for the paragraph.";
const CONTENT_NOTE: &str =
    "paraContent is a source HTML fragment; fullContent is the normalized plain-text result.";

pub(crate) async fn get_paragraph<T: HttpTransport, F: FnOnce() -> String>(
    transport: &T,
    request: &GetParagraphRequest,
    cancellation: &CancellationToken,
    fetched_at: F,
) -> Result<GetParagraphResult, KasbError> {
    let source_url = paragraph_content_url(request.std_num(), request.para_num());
    let payload = fetch_json(transport, &source_url, cancellation).await?;
    let payload = required_object(payload, &source_url, "paragraph content")?;
    let paragraphs = required_array(payload.get("paraContents"), &source_url, "paraContents")?;

    if paragraphs.is_empty() {
        return Err(KasbFailure::source_failure(
            KasbFailureCode::NotFound,
            format!(
                "Could not find paragraph {}-{}.",
                request.std_num(),
                request.para_num()
            ),
            false,
            &source_url,
        )
        .into());
    }
    if paragraphs.len() != 1 {
        return Err(source_changed(
            &source_url,
            "Exact paragraph lookup returned multiple rows.",
        )
        .into());
    }

    let mut paragraph = normalize_paragraph(&paragraphs[0], &source_url)?;
    if paragraph.std_num != request.std_num()
        || paragraph.para_num != request.para_num()
        || paragraph.unique_key != format!("{}-{}", request.std_num(), request.para_num())
    {
        return Err(source_changed(
            &source_url,
            "Paragraph response identifiers do not match the request.",
        )
        .into());
    }

    let enrichment = optional_section_enrichment(
        transport,
        &paragraph.std_num,
        &paragraph.index_document_id,
        cancellation,
    )
    .await?;

    if let Some(enrichment) = enrichment.as_ref() {
        paragraph
            .standard_title
            .clone_from(&enrichment.standard_title);
        paragraph
            .standard_kind
            .clone_from(&enrichment.standard_kind);
        paragraph.section_title.clone_from(&enrichment.title);
        paragraph.section_ref.clone_from(&enrichment.reference);
    }

    let references = ParagraphReferences {
        std_num: paragraph.std_num.clone(),
        para_num: paragraph.para_num.clone(),
        unique_key: paragraph.unique_key.clone(),
        index_document_id: paragraph.index_document_id.clone(),
        standard_title: paragraph.standard_title.clone(),
        standard_kind: paragraph.standard_kind.clone(),
        section_title: paragraph.section_title.clone(),
        section_ref: paragraph.section_ref.clone(),
        paragraph_url: source_url.clone(),
    };
    let warnings = if enrichment.as_ref().is_some_and(|value| value.exists) {
        Vec::new()
    } else {
        vec![ParagraphWarning {
            code: ParagraphWarningCode::ParagraphMetadataIncomplete,
            message: METADATA_WARNING.to_owned(),
        }]
    };

    Ok(GetParagraphResult {
        result: GetParagraphPayload {
            request: request.clone(),
            paragraph,
        },
        metadata: ResultMetadata {
            fetched_at: fetched_at(),
            source: SourceMetadata {
                system: "kasb".to_owned(),
                endpoint: source_url,
            },
            source_behavior: SourceBehavior {
                observation_status: "observed".to_owned(),
                api_base: KASB_API_BASE_URL.to_owned(),
            },
            completeness: Completeness::Complete,
            content: Some(ContentMetadata {
                html_fields: vec!["result.paragraph.paraContent".to_owned()],
                text_fields: vec!["result.paragraph.fullContent".to_owned()],
                notes: vec![CONTENT_NOTE.to_owned()],
            }),
        },
        references,
        warnings,
    })
}

fn normalize_paragraph(value: &Value, source_url: &str) -> Result<Paragraph, KasbError> {
    let item = required_object(value.clone(), source_url, "paragraph")?;
    let std_num = required_string_value(item.get("stdNum"), source_url)?;
    let para_num = required_string_value(item.get("paraNum"), source_url)?;
    let unique_key = required_string_value(item.get("uniqueKey"), source_url)?;
    let index_document_id = required_string_value(item.get("documentId"), source_url)?;
    if is_url_dot_segment(&index_document_id) {
        return Err(source_changed(
            source_url,
            "Paragraph response documentId is a URL dot segment.",
        )
        .into());
    }
    let para_content = item.get("paraContent").and_then(Value::as_str);
    let full_content = item.get("fullContent").and_then(Value::as_str);
    let (Some(para_content), Some(full_content)) = (para_content, full_content) else {
        return Err(
            source_changed(source_url, "Required paragraph response fields changed.").into(),
        );
    };

    Ok(Paragraph {
        std_num,
        para_num,
        unique_key,
        index_document_id,
        standard_title: None,
        standard_kind: None,
        section_title: None,
        section_ref: None,
        para_content: para_content.to_owned(),
        full_content: normalize_kasb_plain_text(full_content),
        sort: optional_number(item.get("sort")),
        faq_doc_numbers: item
            .get("faqDocNumbers")
            .and_then(Value::as_str)
            .map(str::to_owned),
        faq_count: optional_number(item.get("faqCount")),
    })
}

fn required_string_value(value: Option<&Value>, source_url: &str) -> Result<String, KasbError> {
    value
        .and_then(to_string_value)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            KasbError::from(source_changed(
                source_url,
                "Required paragraph response fields changed.",
            ))
        })
}

async fn optional_section_enrichment<T: HttpTransport>(
    transport: &T,
    std_num: &str,
    index_document_id: &str,
    cancellation: &CancellationToken,
) -> Result<Option<SectionEnrichment>, KasbError> {
    match section_enrichment(transport, std_num, index_document_id, cancellation).await {
        Ok(value) => Ok(Some(value)),
        Err(KasbError::Cancelled) => Err(KasbError::Cancelled),
        Err(KasbError::Failure(_)) => Ok(None),
    }
}
