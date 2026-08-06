use std::collections::HashSet;
use std::sync::LazyLock;

use regex::Regex;
use serde_json::{Map, Number, Value};

use crate::capabilities::get_paragraph::{
    Completeness, ContentMetadata, GetParagraphPayload, GetParagraphRequest, GetParagraphResult,
    Paragraph, ParagraphReferences, ParagraphWarning, ParagraphWarningCode, ResultMetadata,
    SourceBehavior, SourceMetadata,
};
use crate::http::{CancellationToken, HttpResponse, HttpTransport, TransportError};
use crate::{KasbError, KasbFailure, KasbFailureCode};

use super::normalize::normalize_kasb_plain_text;
use super::urls::{KASB_API_BASE_URL, paragraph_content_url, standard_indexes_url};

const METADATA_WARNING: &str =
    "Could not fully verify parent standard/section metadata for the paragraph.";
const CONTENT_NOTE: &str =
    "paraContent is a source HTML fragment; fullContent is the normalized plain-text result.";
static GENERAL_CHAPTER_TITLE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^제[0-9]+장(?:\s|$)").expect("standard kind regex is valid"));

pub(crate) async fn get_paragraph<T: HttpTransport>(
    transport: &T,
    request: &GetParagraphRequest,
    cancellation: &CancellationToken,
    fetched_at: String,
) -> Result<GetParagraphResult, KasbError> {
    let source_url = paragraph_content_url(request.std_num(), request.para_num());
    let payload = fetch_json(transport, &source_url, cancellation).await?;
    let payload = required_object(payload, &source_url, "paragraph content")?;
    let paragraphs = required_array(payload.get("paraContents"), &source_url, "paraContents")?;

    if paragraphs.is_empty() {
        return Err(KasbFailure::source(
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
            fetched_at,
            source: SourceMetadata {
                system: "kasb".to_owned(),
                endpoint: source_url,
            },
            source_behavior: SourceBehavior {
                observation_status: "observed".to_owned(),
                api_base: KASB_API_BASE_URL.to_owned(),
            },
            completeness: Completeness::Complete,
            content: ContentMetadata {
                html_fields: vec!["result.paragraph.paraContent".to_owned()],
                text_fields: vec!["result.paragraph.fullContent".to_owned()],
                notes: vec![CONTENT_NOTE.to_owned()],
            },
        },
        references,
        warnings,
    })
}

async fn fetch_json<T: HttpTransport>(
    transport: &T,
    source_url: &str,
    cancellation: &CancellationToken,
) -> Result<Value, KasbError> {
    if cancellation.is_cancelled() {
        return Err(KasbError::Cancelled);
    }
    let response = tokio::select! {
        biased;
        _ = cancellation.cancelled() => return Err(KasbError::Cancelled),
        response = transport.get(source_url, cancellation) => response,
    };

    let response = match response {
        Ok(response) => response,
        Err(TransportError::Cancelled) => return Err(KasbError::Cancelled),
        Err(TransportError::Timeout | TransportError::Unavailable(_)) => {
            return Err(KasbFailure::source(
                KasbFailureCode::SourceUnavailable,
                "Could not connect to the KASB API.",
                true,
                source_url,
            )
            .into());
        }
    };

    ensure_success(response, source_url)
}

fn ensure_success(response: HttpResponse, source_url: &str) -> Result<Value, KasbError> {
    if !(200..300).contains(&response.status) {
        return Err(KasbFailure::source(
            if response.status == 404 {
                KasbFailureCode::NotFound
            } else {
                KasbFailureCode::SourceUnavailable
            },
            format!("KASB API request failed (status={}).", response.status),
            response.status == 429 || response.status >= 500,
            source_url,
        )
        .into());
    }

    serde_json::from_slice(&response.body).map_err(|_| {
        KasbError::from(source_changed(
            source_url,
            "KASB API returned a non-JSON response.",
        ))
    })
}

fn normalize_paragraph(value: &Value, source_url: &str) -> Result<Paragraph, KasbError> {
    let item = required_object(value.clone(), source_url, "paragraph")?;
    let std_num = required_string_value(item.get("stdNum"), source_url)?;
    let para_num = required_string_value(item.get("paraNum"), source_url)?;
    let unique_key = required_string_value(item.get("uniqueKey"), source_url)?;
    let index_document_id = required_string_value(item.get("documentId"), source_url)?;
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

fn required_object(
    value: Value,
    source_url: &str,
    context: &str,
) -> Result<Map<String, Value>, KasbError> {
    match value {
        Value::Object(value) => Ok(value),
        _ => Err(source_changed(
            source_url,
            format!("Could not find {context} response object."),
        )
        .into()),
    }
}

fn required_array<'a>(
    value: Option<&'a Value>,
    source_url: &str,
    context: &str,
) -> Result<&'a Vec<Value>, KasbError> {
    value.and_then(Value::as_array).ok_or_else(|| {
        KasbError::from(source_changed(
            source_url,
            format!("Could not find {context} array."),
        ))
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

fn to_string_value(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => Some(value.clone()),
        Value::Number(value) => Some(number_to_string(value)),
        _ => None,
    }
}

fn number_to_string(value: &Number) -> String {
    if let Some(value) = value.as_i64() {
        return value.to_string();
    }
    if let Some(value) = value.as_u64() {
        return value.to_string();
    }
    let value = value
        .as_f64()
        .expect("serde_json numbers are finite and representable as f64");
    if value == 0.0 {
        return "0".to_owned();
    }
    if value.fract() == 0.0 && value.abs() < 1e21 {
        return format!("{value:.0}");
    }
    value.to_string()
}

fn optional_number(value: Option<&Value>) -> Option<Number> {
    value.and_then(Value::as_number).cloned()
}

fn source_changed(source_url: &str, message: impl Into<String>) -> KasbFailure {
    KasbFailure::source(KasbFailureCode::SourceChanged, message, false, source_url)
}

#[derive(Debug)]
struct SectionEnrichment {
    standard_title: Option<String>,
    standard_kind: Option<String>,
    exists: bool,
    title: Option<String>,
    reference: Option<String>,
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

async fn section_enrichment<T: HttpTransport>(
    transport: &T,
    std_num: &str,
    index_document_id: &str,
    cancellation: &CancellationToken,
) -> Result<SectionEnrichment, KasbError> {
    let source_url = standard_indexes_url(std_num);
    let payload = fetch_json(transport, &source_url, cancellation).await?;
    let payload = required_object(payload, &source_url, "standard indexes")?;
    let source_items = required_array(
        payload.get("standardIndexes"),
        &source_url,
        "standardIndexes",
    )?;

    let mut index_document_ids = HashSet::new();
    let mut sections = Vec::new();
    for item in source_items {
        if let Some(document_id) = raw_structure_document_id(item, &source_url, std_num)? {
            index_document_ids.insert(document_id);
        }
        if let Some(section) = normalize_section(item, &source_url, std_num)? {
            sections.push(section);
        }
    }
    if !source_items.is_empty() && sections.is_empty() {
        return Err(source_changed(&source_url, "Standard structure row fields changed.").into());
    }

    let standard_title = sections
        .iter()
        .find(|section| section.level == 1.0)
        .map(|section| section.title.clone());
    let standard_kind = standard_title.as_deref().map(infer_standard_kind);
    let section = sections
        .iter()
        .find(|section| section.index_document_id == index_document_id);

    Ok(SectionEnrichment {
        standard_title,
        standard_kind,
        exists: section.is_some() || index_document_ids.contains(index_document_id),
        title: section.map(|value| value.title.clone()),
        reference: section.map(|value| value.reference.clone()),
    })
}

#[derive(Debug)]
struct Section {
    index_document_id: String,
    title: String,
    reference: String,
    level: f64,
}

fn raw_structure_document_id(
    value: &Value,
    source_url: &str,
    expected_std_num: &str,
) -> Result<Option<String>, KasbError> {
    let Some(item) = value.as_object() else {
        return Ok(None);
    };
    let document_id = item.get("documentId").and_then(to_string_value);
    let std_num = item.get("stdNum").and_then(to_string_value);
    let (Some(document_id), Some(std_num)) = (document_id, std_num) else {
        return Ok(None);
    };
    if std_num != expected_std_num {
        return Err(source_changed(
            source_url,
            "Standard structure row stdNum does not match the request.",
        )
        .into());
    }
    Ok(Some(document_id))
}

fn normalize_section(
    value: &Value,
    source_url: &str,
    expected_std_num: &str,
) -> Result<Option<Section>, KasbError> {
    let Some(item) = value.as_object() else {
        return Ok(None);
    };
    let Some(index_document_id) = raw_structure_document_id(value, source_url, expected_std_num)?
    else {
        return Ok(None);
    };
    let Some(title) = item.get("title").and_then(Value::as_str) else {
        return Ok(None);
    };
    let Some(level) = item.get("level").and_then(Value::as_f64) else {
        return Ok(None);
    };
    Ok(Some(Section {
        index_document_id,
        title: title.to_owned(),
        reference: item
            .get("ref")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned(),
        level,
    }))
}

fn infer_standard_kind(standard_title: &str) -> String {
    if standard_title.contains("기업회계기준해석서") {
        return "k-ifrs-interpretation".to_owned();
    }
    if standard_title.contains("기업회계기준서") {
        return "k-ifrs-standard".to_owned();
    }
    if GENERAL_CHAPTER_TITLE.is_match(standard_title) {
        return "general-gaap-chapter".to_owned();
    }
    "standard".to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_standard_title_families() {
        assert_eq!(
            infer_standard_kind("기업회계기준서 제1116호 리스"),
            "k-ifrs-standard"
        );
        assert_eq!(
            infer_standard_kind("기업회계기준해석서 제2123호"),
            "k-ifrs-interpretation"
        );
        assert_eq!(
            infer_standard_kind("제2장 재무제표"),
            "general-gaap-chapter"
        );
        assert_eq!(infer_standard_kind("기타"), "standard");
    }

    #[test]
    fn source_numbers_use_the_observed_javascript_identifier_form() {
        assert_eq!(
            to_string_value(&serde_json::json!(1116)),
            Some("1116".to_owned())
        );
        assert_eq!(
            to_string_value(&serde_json::json!(1116.0)),
            Some("1116".to_owned())
        );
        assert_eq!(
            to_string_value(&serde_json::json!(-0.0)),
            Some("0".to_owned())
        );
    }
}
