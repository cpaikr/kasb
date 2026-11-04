use std::collections::HashSet;

use crate::capabilities::get_paragraph::GetParagraphRequest;
use crate::capabilities::get_paragraph_range::{
    GetParagraphRangePayload, GetParagraphRangeRequest, GetParagraphRangeResult,
    ParagraphRangeReferences, ParagraphRangeSection, ParagraphRangeWarning,
    ParagraphRangeWarningCode,
};
use crate::capabilities::get_section::{SectionClause, SectionClauseKind};
use crate::capabilities::{
    Completeness, ContentMetadata, ResultMetadata, SourceBehavior, SourceMetadata,
};
use crate::http::{CancellationToken, HttpTransport};
use crate::{KasbError, KasbFailure};

use super::decode::source_changed;
use super::operations::{SectionContent, fetch_section_content};
use super::paragraph::fetch_exact_paragraph;
use super::structure::{enrichment_from_snapshot, fetch_structure_snapshot};
use super::urls::KASB_API_BASE_URL;

/// Every fetched section is a separate paced request, so a range that spans
/// more indexed sections than this is rejected before any section is fetched.
const MAX_RANGE_SECTIONS: usize = 20;

const CONTENT_NOTE: &str =
    "paraContent is a source HTML fragment; fullContent is the normalized plain-text result.";

/// Resolves the range in source order without parsing paragraph numbers: each
/// boundary's exact paragraph lookup names its parent section, the structure
/// index orders the sections between those parents, and the concatenated
/// clauses are sliced from the first `from` through the first following `to`.
/// Ancestor sections repeat their children's paragraphs (observed: 1116 `9~17`
/// also returns `12~17`), so paragraphs are kept once by `paraNum` and fetching
/// stops as soon as the range is complete.
pub(crate) async fn get_paragraph_range<T: HttpTransport, F: FnOnce() -> String>(
    transport: &T,
    request: &GetParagraphRangeRequest,
    cancellation: &CancellationToken,
    fetched_at: F,
) -> Result<GetParagraphRangeResult, KasbError> {
    let std_num = request.std_num();
    let from_section = boundary_section(transport, std_num, request.from(), cancellation).await?;
    let to_section = if request.from() == request.to() {
        from_section.clone()
    } else {
        boundary_section(transport, std_num, request.to(), cancellation).await?
    };

    let snapshot = fetch_structure_snapshot(transport, std_num, cancellation).await?;
    let position = |index_document_id: &str, boundary: &str| {
        snapshot
            .sections
            .iter()
            .position(|section| section.index_document_id == index_document_id)
            .ok_or_else(|| {
                KasbError::from(source_changed(
                    &snapshot.source_url,
                    format!(
                        "Paragraph {boundary} belongs to section {index_document_id}, which the standard structure does not list."
                    ),
                ))
            })
    };
    let start = position(&from_section, request.from())?;
    let end = position(&to_section, request.to())?;
    if start > end {
        return Err(reversed(request).into());
    }
    let candidates = &snapshot.sections[start..=end];
    if candidates.len() > MAX_RANGE_SECTIONS {
        return Err(KasbFailure::invalid(
            "to",
            format!(
                "The range spans {} indexed sections; at most {MAX_RANGE_SECTIONS} can be combined. Narrow the range or retrieve sections with get-section.",
                candidates.len()
            ),
        )
        .into());
    }

    let mut sections = Vec::with_capacity(candidates.len());
    let mut combined = Vec::new();
    let mut incomplete = false;
    for candidate in candidates {
        let SectionContent {
            source_url,
            clauses,
            incomplete: section_incomplete,
            ..
        } = fetch_section_content(
            transport,
            std_num,
            &candidate.index_document_id,
            None,
            cancellation,
        )
        .await?;
        incomplete |= section_incomplete;
        combined.extend(clauses);
        sections.push(ParagraphRangeSection {
            index_document_id: candidate.index_document_id.clone(),
            title: candidate.title.clone(),
            r#ref: (!candidate.r#ref.is_empty()).then(|| candidate.r#ref.clone()),
            level: candidate.level.clone(),
            section_url: source_url,
        });
        if range_bounds(&combined, request).is_some() {
            break;
        }
    }
    let clauses = slice_range(combined, request, &snapshot.source_url)?;

    let enrichment = enrichment_from_snapshot(&snapshot, &from_section);
    let mut warnings = Vec::new();
    if incomplete {
        warnings.push(ParagraphRangeWarning {
            code: ParagraphRangeWarningCode::PartialClauseNormalization,
            message: "Some section paragraph rows could not be normalized and were omitted."
                .to_owned(),
        });
    }
    // A structure row dropped between the boundaries is never fetched.
    if snapshot.incomplete {
        warnings.push(ParagraphRangeWarning {
            code: ParagraphRangeWarningCode::SourceMetadataIncomplete,
            message: "Some standard structure rows could not be normalized, so a section inside the range may be missing.".to_owned(),
        });
    }
    let partial = !warnings.is_empty();
    Ok(GetParagraphRangeResult {
        references: ParagraphRangeReferences {
            std_num: std_num.to_owned(),
            from: request.from().to_owned(),
            to: request.to().to_owned(),
            standard_title: enrichment.standard_title,
            standard_kind: enrichment.standard_kind,
            index_document_ids: sections
                .iter()
                .map(|section| section.index_document_id.clone())
                .collect(),
            structure_url: snapshot.source_url.clone(),
        },
        result: GetParagraphRangePayload {
            request: request.clone(),
            sections,
            clauses,
        },
        metadata: ResultMetadata {
            fetched_at: fetched_at(),
            source: SourceMetadata {
                system: "kasb".to_owned(),
                endpoint: snapshot.source_url,
            },
            source_behavior: SourceBehavior {
                observation_status: "observed".to_owned(),
                api_base: KASB_API_BASE_URL.to_owned(),
            },
            completeness: if partial {
                Completeness::Partial
            } else {
                Completeness::Complete
            },
            content: Some(ContentMetadata {
                html_fields: vec!["result.clauses[].paraContent".to_owned()],
                text_fields: vec!["result.clauses[].fullContent".to_owned()],
                notes: vec![CONTENT_NOTE.to_owned()],
            }),
        },
        warnings,
    })
}

async fn boundary_section<T: HttpTransport>(
    transport: &T,
    std_num: &str,
    para_num: &str,
    cancellation: &CancellationToken,
) -> Result<String, KasbError> {
    let request = GetParagraphRequest::new(std_num, para_num)?;
    let (paragraph, _) = fetch_exact_paragraph(transport, &request, cancellation).await?;
    Ok(paragraph.index_document_id)
}

/// Indices of the first `from` paragraph and the first `to` paragraph at or
/// after it, when both are present.
fn range_bounds(
    combined: &[SectionClause],
    request: &GetParagraphRangeRequest,
) -> Option<(usize, usize)> {
    let start = combined
        .iter()
        .position(|clause| is_paragraph(clause, request.from()))?;
    let offset = combined[start..]
        .iter()
        .position(|clause| is_paragraph(clause, request.to()))?;
    Some((start, start + offset))
}

fn is_paragraph(clause: &SectionClause, para_num: &str) -> bool {
    clause.kind == SectionClauseKind::Paragraph && clause.para_num.as_deref() == Some(para_num)
}

fn slice_range(
    combined: Vec<SectionClause>,
    request: &GetParagraphRangeRequest,
    structure_url: &str,
) -> Result<Vec<SectionClause>, KasbError> {
    let missing = |boundary: &str| {
        KasbError::from(source_changed(
            structure_url,
            format!(
                "Section content for the range does not contain paragraph {boundary}, although its exact lookup named one of these sections."
            ),
        ))
    };
    let Some((start, end)) = range_bounds(&combined, request) else {
        let contains =
            |para_num: &str| combined.iter().any(|clause| is_paragraph(clause, para_num));
        return Err(if !contains(request.from()) {
            missing(request.from())
        } else if contains(request.to()) {
            reversed(request).into()
        } else {
            missing(request.to())
        });
    };

    let mut seen_paragraphs = HashSet::new();
    let mut seen_titles = HashSet::new();
    Ok(combined
        .into_iter()
        .skip(start)
        .take(end - start + 1)
        .filter(|clause| match (&clause.para_num, &clause.title) {
            (Some(para_num), _) => seen_paragraphs.insert(para_num.clone()),
            (None, Some(title)) => {
                seen_titles.insert((clause.index_document_id.clone(), title.clone()))
            }
            (None, None) => true,
        })
        .collect())
}

fn reversed(request: &GetParagraphRangeRequest) -> KasbFailure {
    KasbFailure::invalid(
        "to",
        format!(
            "Paragraph {} comes before paragraph {} in the standard's source order; swap \"from\" and \"to\".",
            request.to(),
            request.from()
        ),
    )
}
