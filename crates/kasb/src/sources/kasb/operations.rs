use std::cmp::Ordering;
use std::collections::{BTreeMap, HashSet};
use std::sync::LazyLock;

use chrono::{DateTime, NaiveDate, Utc};
use futures_util::{StreamExt, TryStreamExt, stream};
use icu_collator::{Collator, CollatorBorrowed};
use icu_locale::locale;
use regex::Regex;
use serde_json::{Number, Value};
use unicode_normalization::UnicodeNormalization;

use crate::capabilities::get_qna::{
    GetQnaPayload, GetQnaRequest, GetQnaResult, Qna, QnaReferences,
};
use crate::capabilities::get_section::{
    GetSectionPayload, GetSectionRequest, GetSectionResult, SectionClause, SectionClauseKind,
    SectionMetadata, SectionReferences, SectionWarning, SectionWarningCode,
};
use crate::capabilities::get_standard_structure::{
    GetStandardStructurePayload, GetStandardStructureRequest, GetStandardStructureResult,
    StandardStructureReferences, StandardStructureWarning, StandardStructureWarningCode,
};
use crate::capabilities::search_qna::{
    DEFAULT_QNA_TYPES, PaginationStatus, QnaDateSort, QnaSearchItem, QnaSearchItemReferences,
    SearchQnaPayload, SearchQnaReferences, SearchQnaRequest, SearchQnaResult, SearchQnaWarning,
    SearchQnaWarningCode,
};
use crate::capabilities::search_standards::{
    SearchStandardItem, SearchStandardNextActions, SearchStandardReferences,
    SearchStandardsPayload, SearchStandardsReferences, SearchStandardsRequest,
    SearchStandardsResult, SearchStandardsSort, SearchStandardsWarning, SearchStandardsWarningCode,
    StructureNextAction, StructureNextInput,
};
use crate::capabilities::validation::is_url_dot_segment;
use crate::capabilities::{
    Completeness, ContentMetadata, ResultMetadata, SourceBehavior, SourceMetadata,
};
use crate::http::{CancellationToken, HttpTransport};
use crate::text::{
    ECMASCRIPT_WHITESPACE_CLASS, is_ecmascript_whitespace, trim_ecmascript_whitespace,
    trim_end_ecmascript_whitespace,
};
use crate::{KasbError, KasbFailure, KasbFailureCode};

use super::decode::{
    assert_any_normalized, number_f64, number_string, optional_number, optional_string,
    required_array, required_object, required_object_ref, source_changed, to_string_value,
};
use super::normalize::{normalize_kasb_plain_text, strip_html};
use super::structure::{
    SectionEnrichment, enrichment_from_snapshot, fetch_structure_snapshot, infer_standard_kind,
    section_enrichment,
};
use super::transport::fetch_json;
use super::urls::{
    KASB_API_BASE_URL, paragraphs_url, qna_content_url, qnas_search_url,
    standard_indexes_search_url, standard_indexes_url, standards_search_url,
};

static HTML_TAG: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"<[^>]+>").expect("HTML regex is valid"));
static TRAILING_UNDEFINED: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(&format!(
        r"(?:(?-u:\bundefined\b)[{ECMASCRIPT_WHITESPACE_CLASS}]*){{2,}}$"
    ))
    .expect("cleanup regex is valid")
});
static ACCOUNTING_TREATMENT_SUFFIX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(&format!(
        r"[{ECMASCRIPT_WHITESPACE_CLASS}]*회계처리[{ECMASCRIPT_WHITESPACE_CLASS}]*$"
    ))
    .expect("suggestion regex is valid")
});
static KOREAN_COLLATOR: LazyLock<CollatorBorrowed<'static>> = LazyLock::new(|| {
    Collator::try_new(locale!("ko").into(), Default::default())
        .expect("compiled ICU4X data includes Korean collation")
});
const MAX_STANDARD_ENRICHMENT_ROWS: usize = 512;
const STANDARD_ENRICHMENT_CONCURRENCY: usize = 8;

pub(crate) async fn search_standards<T: HttpTransport, F: FnOnce() -> String>(
    transport: &T,
    request: &SearchStandardsRequest,
    cancellation: &CancellationToken,
    fetched_at: F,
) -> Result<SearchStandardsResult, KasbError> {
    let source_url = standards_search_url(request.keyword());
    let payload = required_object(
        fetch_json(transport, &source_url, cancellation).await?,
        &source_url,
        "standard search",
    )?;
    let standards = required_object_ref(payload.get("standards"), &source_url, "standards")?;
    let source_items = required_array(standards.get("stdCountArr"), &source_url, "stdCountArr")?;
    let total_match_count =
        optional_number(standards.get("totalCount")).unwrap_or_else(|| Number::from(0));
    let mut items = source_items
        .iter()
        .filter_map(normalize_standard_search_item)
        .collect::<Vec<_>>();
    assert_any_normalized(
        source_items,
        &items,
        &source_url,
        "Standard search result fields changed.",
    )?;
    let incomplete = items.len() != source_items.len();
    let total_standard_count = items.len();

    match request.sort() {
        SearchStandardsSort::Relevance | SearchStandardsSort::Title => {
            if items.len() > MAX_STANDARD_ENRICHMENT_ROWS {
                return Err(source_changed(
                    &source_url,
                    format!(
                        "Standard search returned more than {MAX_STANDARD_ENRICHMENT_ROWS} rows; refusing unbounded ranking enrichment."
                    ),
                )
                .into());
            }
            enrich_standard_items(transport, &mut items, cancellation).await?;
            sort_standard_items(&mut items, request);
            items.truncate(request.limit() as usize);
        }
        SearchStandardsSort::MatchCount | SearchStandardsSort::StdNum => {
            sort_standard_items(&mut items, request);
            items.truncate(request.limit() as usize);
            enrich_standard_items(transport, &mut items, cancellation).await?;
        }
    }
    let returned_count = items.len();
    let mut warnings = Vec::new();
    if returned_count < total_standard_count {
        warnings.push(SearchStandardsWarning {
            code: SearchStandardsWarningCode::TruncatedResults,
            message: format!("Search results were limited to {} items.", request.limit()),
        });
    }
    if incomplete {
        warnings.push(SearchStandardsWarning {
            code: SearchStandardsWarningCode::SourceMetadataIncomplete,
            message: "Some standard search rows could not be normalized and were omitted."
                .to_owned(),
        });
    }

    Ok(SearchStandardsResult {
        result: SearchStandardsPayload {
            request: request.clone(),
            total_match_count,
            total_standard_count,
            returned_count,
            standards: items,
            suggested_keywords: suggest_standard_keywords(request.keyword()),
        },
        metadata: metadata(fetched_at(), source_url.clone(), incomplete, None),
        references: SearchStandardsReferences {
            search_url: source_url,
        },
        warnings,
    })
}

pub(crate) async fn get_standard_structure<T: HttpTransport, F: FnOnce() -> String>(
    transport: &T,
    request: &GetStandardStructureRequest,
    cancellation: &CancellationToken,
    fetched_at: F,
) -> Result<GetStandardStructureResult, KasbError> {
    let snapshot = fetch_structure_snapshot(transport, request.std_num(), cancellation).await?;
    if snapshot.sections.is_empty() {
        return Err(KasbFailure::source_failure(
            KasbFailureCode::NotFound,
            format!(
                "Could not find the structure for standard {}.",
                request.std_num()
            ),
            false,
            &snapshot.source_url,
        )
        .into());
    }
    let source_url;
    let sections = if let Some(keyword) = request.keyword() {
        source_url = standard_indexes_search_url(request.std_num(), keyword);
        let payload = required_object(
            fetch_json(transport, &source_url, cancellation).await?,
            &source_url,
            "standard index search",
        )?;
        if !payload.contains_key("searchedUniqueKeys") {
            return Err(
                source_changed(&source_url, "Could not find searchedUniqueKeys array.").into(),
            );
        }
        required_array(
            payload.get("searchedUniqueKeys"),
            &source_url,
            "searchedUniqueKeys",
        )?;
        let count_map = required_object_ref(
            payload.get("searchedIndexCountMap"),
            &source_url,
            "searchedIndexCountMap",
        )?;
        let known = snapshot
            .sections
            .iter()
            .map(|value| value.index_document_id.as_str())
            .collect::<HashSet<_>>();
        let mut matched = HashSet::new();
        for (document_id, count) in count_map {
            if document_id == "null" {
                continue;
            }
            let Some(count) = optional_number(Some(count)) else {
                return Err(source_changed(
                    &source_url,
                    "Matched standard structure row match count changed.",
                )
                .into());
            };
            if !known.contains(document_id.as_str()) {
                return Err(source_changed(&source_url, "Matched standard structure row documentId does not match the standard structure.").into());
            }
            if number_f64(&count) > 0.0 {
                matched.insert(document_id.as_str());
            }
        }
        snapshot
            .sections
            .iter()
            .filter(|value| matched.contains(value.index_document_id.as_str()))
            .cloned()
            .collect()
    } else {
        source_url = snapshot.source_url.clone();
        snapshot.sections.clone()
    };
    let content = sections
        .iter()
        .any(|value| HTML_TAG.is_match(&value.title))
        .then(|| ContentMetadata {
            html_fields: vec!["result.sections[].title".to_owned()],
            notes: vec!["Some structure titles preserve KASB source HTML fragments.".to_owned()],
            ..ContentMetadata::default()
        });
    let mut warnings = Vec::new();
    if request.keyword().is_some() {
        warnings.push(StandardStructureWarning {
            code: StandardStructureWarningCode::SearchFilteredStructure,
            message: "Structure results are filtered by keyword.".to_owned(),
        });
    }
    if snapshot.incomplete {
        warnings.push(StandardStructureWarning {
            code: StandardStructureWarningCode::SourceMetadataIncomplete,
            message: "Some standard structure rows could not be normalized and were omitted."
                .to_owned(),
        });
    }
    Ok(GetStandardStructureResult {
        result: GetStandardStructurePayload {
            request: request.clone(),
            returned_count: sections.len(),
            sections,
        },
        metadata: metadata(
            fetched_at(),
            source_url.clone(),
            snapshot.incomplete,
            content,
        ),
        references: StandardStructureReferences {
            std_num: request.std_num().to_owned(),
            structure_url: source_url,
        },
        warnings,
    })
}

pub(crate) async fn get_section<T: HttpTransport, F: FnOnce() -> String>(
    transport: &T,
    request: &GetSectionRequest,
    cancellation: &CancellationToken,
    fetched_at: F,
) -> Result<GetSectionResult, KasbError> {
    let lookup = resolve_section_lookup(transport, request, cancellation).await?;
    let source_url = paragraphs_url(
        request.std_num(),
        &lookup.index_document_id,
        request.keyword(),
    );
    let payload = required_object(
        fetch_json(transport, &source_url, cancellation).await?,
        &source_url,
        "paragraphs",
    )?;
    let source_clauses = required_array(payload.get("clauses"), &source_url, "clauses")?;
    let mut clauses = Vec::new();
    for source_clause in source_clauses {
        if let Some(clause) = normalize_section_clause(
            source_clause,
            &source_url,
            request.std_num(),
            &lookup.index_document_id,
        )? {
            clauses.push(clause);
        }
    }
    assert_any_normalized(
        source_clauses,
        &clauses,
        &source_url,
        "Section paragraph row fields changed.",
    )?;
    let incomplete = clauses.len() != source_clauses.len();
    let (enrichment, enrichment_failure) = if lookup.enrichment.is_some() {
        (lookup.enrichment, None)
    } else {
        match section_enrichment(
            transport,
            request.std_num(),
            &lookup.index_document_id,
            cancellation,
        )
        .await
        {
            Ok(value) => (Some(value), None),
            Err(KasbError::Cancelled) => return Err(KasbError::Cancelled),
            Err(error @ KasbError::Failure(_)) => (None, Some(error)),
        }
    };
    if clauses.is_empty() && !enrichment.as_ref().is_some_and(|value| value.exists) {
        return Err(enrichment_failure.unwrap_or_else(|| section_not_found(&source_url).into()));
    }
    let section_title = optional_string(payload.get("mainTitle"))
        .or_else(|| enrichment.as_ref().and_then(|value| value.title.clone()))
        .unwrap_or_default();
    let level = optional_number(payload.get("mainTitleLevel"))
        .or_else(|| enrichment.as_ref().and_then(|value| value.level.clone()));
    let sort = optional_number(payload.get("mainTitleSort"))
        .or_else(|| enrichment.as_ref().and_then(|value| value.sort.clone()));
    let standard_title = enrichment
        .as_ref()
        .and_then(|value| value.standard_title.clone());
    let standard_kind = enrichment
        .as_ref()
        .and_then(|value| value.standard_kind.clone());
    let reference = enrichment
        .as_ref()
        .and_then(|value| value.reference.clone());
    let mut warnings = Vec::new();
    if lookup.ambiguous_ref {
        warnings.push(SectionWarning { code: SectionWarningCode::AmbiguousRefResolved, message: "Multiple sections use the same ref, so the most specific child section was selected.".to_owned() });
    }
    if clauses.is_empty() {
        warnings.push(SectionWarning {
            code: SectionWarningCode::EmptySection,
            message: "The section has no paragraphs.".to_owned(),
        });
    }
    if incomplete {
        warnings.push(SectionWarning {
            code: SectionWarningCode::PartialClauseNormalization,
            message: "Some section paragraph rows could not be normalized and were omitted."
                .to_owned(),
        });
    }
    Ok(GetSectionResult {
        result: GetSectionPayload {
            request: request.clone(),
            section: SectionMetadata { std_num: request.std_num().to_owned(), index_document_id: lookup.index_document_id.clone(), standard_title: standard_title.clone(), standard_kind: standard_kind.clone(), title: section_title.clone(), r#ref: reference.clone(), level, sort },
            clauses,
        },
        metadata: metadata(fetched_at(), source_url.clone(), incomplete, Some(ContentMetadata { html_fields: vec!["result.clauses[].paraContent".to_owned()], text_fields: vec!["result.clauses[].fullContent".to_owned()], notes: vec!["paraContent is a source HTML fragment; fullContent is the normalized plain-text result.".to_owned()] })),
        references: SectionReferences { std_num: request.std_num().to_owned(), index_document_id: lookup.index_document_id, standard_title, standard_kind, section_title: (!section_title.is_empty()).then_some(section_title), section_ref: reference, section_url: source_url },
        warnings,
    })
}

pub(crate) async fn search_qna<T: HttpTransport, F: FnOnce() -> String>(
    transport: &T,
    request: &SearchQnaRequest,
    cancellation: &CancellationToken,
    fetched_at: F,
) -> Result<SearchQnaResult, KasbError> {
    if request.has_recency_controls() {
        return search_qna_recency(transport, request, cancellation, fetched_at).await;
    }
    let source_url = qnas_search_url(
        request.keyword(),
        request.page(),
        request.rows(),
        request.types(),
    );
    let page = fetch_qna_page(transport, &source_url, cancellation).await?;
    let status = if page.count_incomplete {
        PaginationStatus::Estimated
    } else {
        PaginationStatus::Known
    };
    let total_count = if page.count_incomplete {
        (request.page() - 1) * request.rows() + page.items.len() as u64
    } else {
        sum_qna_counts(&page.count_by_type, request.types())
    };
    let total_pages = if total_count == 0 {
        0
    } else {
        total_count.div_ceil(request.rows())
    };
    let has_next_page = !page.count_incomplete && request.page() < total_pages;
    let type_labels = qna_type_labels(type_ids_for_page(request, &page.count_by_type, &page.items));
    let warnings = qna_page_warnings(page.incomplete, page.count_incomplete);
    Ok(SearchQnaResult {
        result: SearchQnaPayload {
            request: request.clone(),
            returned_count: page.items.len(),
            items: page.items,
            total_count,
            total_pages,
            has_next_page,
            pagination_status: status,
            count_by_type: page.count_by_type,
            type_labels,
            suggested_keywords: suggest_qna_keywords(request.keyword(), total_count),
        },
        metadata: metadata(
            fetched_at(),
            source_url.clone(),
            page.incomplete || page.count_incomplete,
            Some(qna_search_content(false)),
        ),
        references: SearchQnaReferences {
            search_url: source_url,
        },
        warnings,
    })
}

pub(crate) async fn get_qna<T: HttpTransport, F: FnOnce() -> String>(
    transport: &T,
    request: &GetQnaRequest,
    cancellation: &CancellationToken,
    fetched_at: F,
) -> Result<GetQnaResult, KasbError> {
    let source_url = qna_content_url(request.doc_number(), request.keyword());
    let payload = required_object(
        fetch_json(transport, &source_url, cancellation).await?,
        &source_url,
        "qna detail",
    )?;
    let Some(source_qna) = payload.get("facilityQna").filter(|value| !value.is_null()) else {
        return Err(KasbFailure::source_failure(
            KasbFailureCode::NotFound,
            format!("Could not find Q&A document {}.", request.doc_number()),
            false,
            &source_url,
        )
        .into());
    };
    let qna = normalize_qna(source_qna, &source_url)?;
    if qna.doc_number != request.doc_number() {
        return Err(source_changed(
            &source_url,
            "Q&A response identifier does not match the request.",
        )
        .into());
    }
    Ok(GetQnaResult {
        result: GetQnaPayload { request: request.clone(), qna: qna.clone() },
        metadata: metadata(fetched_at(), source_url.clone(), false, Some(ContentMetadata { html_fields: vec!["result.qna.contentHtml".to_owned(), "result.qna.relStds".to_owned()], text_fields: vec!["result.qna.fullContent".to_owned()], notes: vec!["contentHtml and relStds are source HTML fragments; fullContent is the source plain-text body.".to_owned()] })),
        references: QnaReferences { doc_number: qna.doc_number, qna_url: source_url },
        warnings: Vec::new(),
    })
}

async fn search_qna_recency<T: HttpTransport, F: FnOnce() -> String>(
    transport: &T,
    request: &SearchQnaRequest,
    cancellation: &CancellationToken,
    fetched_at: F,
) -> Result<SearchQnaResult, KasbError> {
    const SCAN_ROWS: u64 = 50;
    const MAX_SCAN_ROWS: u64 = 500;
    let source_url = qnas_search_url(request.keyword(), 1, SCAN_ROWS, request.types());
    let first = fetch_qna_page(transport, &source_url, cancellation).await?;
    let source_total = if first.count_incomplete {
        first.items.len() as u64
    } else {
        sum_qna_counts(&first.count_by_type, request.types())
    };
    let pages = if first.count_incomplete {
        1
    } else {
        source_total
            .div_ceil(SCAN_ROWS)
            .min(MAX_SCAN_ROWS / SCAN_ROWS)
    };
    let mut scanned = vec![first];
    for page in 2..=pages {
        scanned.push(
            fetch_qna_page(
                transport,
                &qnas_search_url(request.keyword(), page, SCAN_ROWS, request.types()),
                cancellation,
            )
            .await?,
        );
    }
    let capacity = scanned.len() as u64 * SCAN_ROWS;
    let mut filtered = scanned
        .iter()
        .flat_map(|page| page.items.clone())
        .filter(|item| qna_in_date_range(item, request))
        .collect::<Vec<_>>();
    if let Some(direction) = request.sort_date() {
        filtered.sort_by(|left, right| compare_qna_date(left, right, direction));
    }
    let offset = ((request.page() - 1) * request.rows()) as usize;
    let items = filtered
        .iter()
        .skip(offset)
        .take(request.rows() as usize)
        .cloned()
        .collect::<Vec<_>>();
    let scanned_all = !scanned[0].count_incomplete && capacity >= source_total;
    let incomplete = scanned.iter().any(|page| page.incomplete);
    let count_incomplete = scanned[0].count_incomplete || !scanned_all;
    let total_count = filtered.len() as u64;
    let total_pages = if total_count == 0 {
        0
    } else {
        total_count.div_ceil(request.rows())
    };
    let count_by_type = count_qna_items(&filtered);
    let type_labels = qna_type_labels(type_ids_for_page(request, &count_by_type, &filtered));
    let mut warnings = qna_page_warnings(incomplete, scanned[0].count_incomplete);
    if !scanned_all {
        warnings.push(SearchQnaWarning { code: SearchQnaWarningCode::SourceMetadataIncomplete, message: format!("Q&A recency controls were applied to the first {capacity} rows out of {source_total} source search results.") });
    }
    Ok(SearchQnaResult {
        result: SearchQnaPayload {
            request: request.clone(),
            returned_count: items.len(),
            items,
            total_count,
            total_pages,
            has_next_page: request.page() < total_pages,
            pagination_status: if count_incomplete {
                PaginationStatus::Estimated
            } else {
                PaginationStatus::Known
            },
            count_by_type,
            type_labels,
            suggested_keywords: suggest_qna_keywords(request.keyword(), total_count),
        },
        metadata: metadata(
            fetched_at(),
            source_url.clone(),
            incomplete || count_incomplete,
            Some(qna_search_content(true)),
        ),
        references: SearchQnaReferences {
            search_url: source_url,
        },
        warnings,
    })
}

struct SectionLookup {
    index_document_id: String,
    enrichment: Option<SectionEnrichment>,
    ambiguous_ref: bool,
}

async fn resolve_section_lookup<T: HttpTransport>(
    transport: &T,
    request: &GetSectionRequest,
    cancellation: &CancellationToken,
) -> Result<SectionLookup, KasbError> {
    if let Some(value) = request.index_document_id() {
        return Ok(SectionLookup {
            index_document_id: value.to_owned(),
            enrichment: None,
            ambiguous_ref: false,
        });
    }
    let reference = request.reference().ok_or_else(|| {
        KasbFailure::source_failure(
            KasbFailureCode::InternalFailure,
            "Section lookup request has neither indexDocumentId nor ref.",
            false,
            "",
        )
    })?;
    let snapshot = fetch_structure_snapshot(transport, request.std_num(), cancellation).await?;
    let normalized = remove_whitespace(reference);
    let mut matches = snapshot
        .sections
        .iter()
        .filter(|value| remove_whitespace(&value.r#ref) == normalized)
        .collect::<Vec<_>>();
    if matches.is_empty() {
        return Err(KasbFailure::source_failure(KasbFailureCode::NotFound, format!("Could not find a section for ref {reference} in standard {}. Use get-standard-structure to confirm available ref and indexDocumentId values.", request.std_num()), false, &snapshot.source_url).into());
    }
    // V1 selects the deepest match, retaining stable source order for ties.
    matches.sort_by(|left, right| {
        number_f64(&right.level)
            .partial_cmp(&number_f64(&left.level))
            .unwrap_or(Ordering::Equal)
    });
    let selected = matches[0];
    Ok(SectionLookup {
        index_document_id: selected.index_document_id.clone(),
        enrichment: Some(enrichment_from_snapshot(
            &snapshot,
            &selected.index_document_id,
        )),
        ambiguous_ref: matches.len() > 1,
    })
}

fn normalize_section_clause(
    value: &Value,
    source_url: &str,
    fallback_std_num: &str,
    fallback_document_id: &str,
) -> Result<Option<SectionClause>, KasbError> {
    let Some(item) = value.as_object() else {
        return Ok(None);
    };
    let explicit_std_num = item.get("stdNum").and_then(to_string_value);
    if explicit_std_num
        .as_deref()
        .is_some_and(|value| value != fallback_std_num)
    {
        return Err(source_changed(
            source_url,
            "Section paragraph row stdNum does not match the request.",
        )
        .into());
    }
    let explicit_document_id = item.get("documentId").and_then(to_string_value);
    if explicit_document_id
        .as_deref()
        .is_some_and(is_url_dot_segment)
    {
        return Err(source_changed(
            source_url,
            "Section paragraph row documentId is a URL dot segment.",
        )
        .into());
    }
    let para_num = item.get("paraNum").and_then(to_string_value);
    let title = optional_string(item.get("title"));
    let para_content = optional_string(item.get("paraContent"));
    let full_content = optional_string(item.get("fullContent"))
        .map(|value| normalize_kasb_plain_text(&value))
        .or_else(|| para_content.as_deref().map(normalize_kasb_plain_text));
    let unique_key = item.get("uniqueKey").and_then(to_string_value);
    if explicit_document_id.is_none()
        && para_num.is_none()
        && para_content.is_none()
        && full_content.is_none()
        && unique_key.is_none()
        && title.is_none()
        && optional_string(item.get("type")).is_none()
    {
        return Ok(None);
    }
    let std_num = explicit_std_num.unwrap_or_else(|| fallback_std_num.to_owned());
    let index_document_id = explicit_document_id.unwrap_or_else(|| fallback_document_id.to_owned());
    if std_num.is_empty() || index_document_id.is_empty() {
        return Err(
            source_changed(source_url, "Could not normalize paragraph identifiers.").into(),
        );
    }
    Ok(Some(SectionClause {
        kind: match (&para_num, &title) {
            (Some(_), _) => SectionClauseKind::Paragraph,
            (None, Some(_)) => SectionClauseKind::Title,
            (None, None) => SectionClauseKind::Unknown,
        },
        title,
        unique_key,
        std_num,
        para_num,
        index_document_id,
        para_content,
        full_content,
        sort: optional_number(item.get("sort")),
        faq_doc_numbers: optional_string(item.get("faqDocNumbers")),
        faq_count: optional_number(item.get("faqCount")),
    }))
}

fn normalize_standard_search_item(value: &Value) -> Option<SearchStandardItem> {
    let item = value.as_object()?;
    let std_num = item.get("key").and_then(to_string_value)?;
    if is_url_dot_segment(&std_num) {
        return None;
    }
    let match_count = optional_number(item.get("doc_count"))?;
    Some(SearchStandardItem {
        references: SearchStandardReferences {
            api_url: standard_indexes_url(&std_num),
        },
        next_actions: SearchStandardNextActions {
            get_standard_structure: StructureNextAction {
                operation: "get-standard-structure".to_owned(),
                input: StructureNextInput {
                    std_num: std_num.clone(),
                },
            },
        },
        std_num,
        standard_title: None,
        standard_kind: None,
        match_count,
    })
}

async fn enrich_standard_items<T: HttpTransport>(
    transport: &T,
    items: &mut [SearchStandardItem],
    cancellation: &CancellationToken,
) -> Result<(), KasbError> {
    let inputs = items
        .iter()
        .enumerate()
        .map(|(index, item)| (index, item.std_num.clone()))
        .collect::<Vec<_>>();
    let enrichments = stream::iter(inputs)
        .map(|(index, std_num)| async move {
            match fetch_structure_snapshot(transport, &std_num, cancellation).await {
                Ok(snapshot) => Ok((
                    index,
                    snapshot
                        .sections
                        .iter()
                        .find(|value| number_f64(&value.level) == 1.0)
                        .map(|value| value.title.clone()),
                )),
                Err(KasbError::Cancelled) => Err(KasbError::Cancelled),
                Err(KasbError::Failure(_)) => Ok((index, None)),
            }
        })
        .buffer_unordered(STANDARD_ENRICHMENT_CONCURRENCY)
        .try_collect::<Vec<_>>()
        .await?;
    for (index, title) in enrichments {
        items[index].standard_title = title;
        items[index].standard_kind = items[index]
            .standard_title
            .as_deref()
            .map(infer_standard_kind);
    }
    Ok(())
}

fn sort_standard_items(items: &mut [SearchStandardItem], request: &SearchStandardsRequest) {
    items.sort_by(|left, right| match request.sort() {
        SearchStandardsSort::MatchCount => cmp_number_desc(&left.match_count, &right.match_count)
            .then_with(|| cmp_std_num(&left.std_num, &right.std_num)),
        SearchStandardsSort::StdNum => cmp_std_num(&left.std_num, &right.std_num),
        SearchStandardsSort::Title => cmp_optional_title(left, right),
        SearchStandardsSort::Relevance => {
            title_score(request.keyword(), right.standard_title.as_deref())
                .cmp(&title_score(
                    request.keyword(),
                    left.standard_title.as_deref(),
                ))
                .then_with(|| cmp_number_desc(&left.match_count, &right.match_count))
                .then_with(|| cmp_std_num(&left.std_num, &right.std_num))
                .then_with(|| cmp_optional_title(left, right))
        }
    });
}

fn title_score(keyword: &str, title: Option<&str>) -> u8 {
    let Some(title) = title else { return 0 };
    let keyword = normalize_search_text(keyword);
    if keyword.is_empty() {
        return 0;
    }
    let subject = normalize_search_text(&strip_standard_prefix(title));
    let title = normalize_search_text(title);
    if subject == keyword {
        4
    } else if subject.starts_with(&keyword) {
        3
    } else if subject.contains(&keyword) {
        2
    } else if title.contains(&keyword) {
        1
    } else {
        0
    }
}

fn strip_standard_prefix(value: &str) -> String {
    static KAS_PREFIX: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(&format!(r"^기업회계기준(?:해석)?서[{ECMASCRIPT_WHITESPACE_CLASS}]*제?[{ECMASCRIPT_WHITESPACE_CLASS}]*[0-9]+[A-Za-z]?[{ECMASCRIPT_WHITESPACE_CLASS}]*호?[{ECMASCRIPT_WHITESPACE_CLASS}]*")).expect("KAS prefix regex is valid")
    });
    static K_IFRS_PREFIX: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(&format!(r"^한국채택국제회계기준[{ECMASCRIPT_WHITESPACE_CLASS}]*제?[{ECMASCRIPT_WHITESPACE_CLASS}]*[0-9]+[A-Za-z]?[{ECMASCRIPT_WHITESPACE_CLASS}]*호?[{ECMASCRIPT_WHITESPACE_CLASS}]*")).expect("K-IFRS prefix regex is valid")
    });
    static GENERAL_GAAP_PREFIX: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(&format!(
            r"^일반기업회계기준[{ECMASCRIPT_WHITESPACE_CLASS}]*"
        ))
        .expect("general GAAP prefix regex is valid")
    });
    static CHAPTER_PREFIX: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(&format!(r"^제[{ECMASCRIPT_WHITESPACE_CLASS}]*[0-9]+[{ECMASCRIPT_WHITESPACE_CLASS}]*장[{ECMASCRIPT_WHITESPACE_CLASS}]*"))
            .expect("chapter prefix regex is valid")
    });

    let value = strip_html(value);
    let value = KAS_PREFIX.replace(&value, "").into_owned();
    let value = K_IFRS_PREFIX.replace(&value, "").into_owned();
    let value = GENERAL_GAAP_PREFIX.replace(&value, "").into_owned();
    let value = CHAPTER_PREFIX.replace(&value, "").into_owned();
    trim_ecmascript_whitespace(&value).to_owned()
}

fn normalize_search_text(value: &str) -> String {
    strip_html(value)
        .nfkc()
        .filter(|value| {
            !is_ecmascript_whitespace(*value) && !"-_,，.()（）「」『』·ㆍ:：".contains(*value)
        })
        .flat_map(char::to_lowercase)
        .collect()
}

fn cmp_number_desc(left: &Number, right: &Number) -> Ordering {
    number_f64(right)
        .partial_cmp(&number_f64(left))
        .unwrap_or(Ordering::Equal)
}
fn cmp_std_num(left: &str, right: &str) -> Ordering {
    match (left.parse::<u64>(), right.parse::<u64>()) {
        (Ok(left), Ok(right)) => left.cmp(&right),
        _ => cmp_korean_text(left, right),
    }
}
fn cmp_optional_title(left: &SearchStandardItem, right: &SearchStandardItem) -> Ordering {
    match (&left.standard_title, &right.standard_title) {
        (Some(left_title), Some(right_title)) => cmp_korean_text(left_title, right_title)
            .then_with(|| cmp_std_num(&left.std_num, &right.std_num)),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => cmp_std_num(&left.std_num, &right.std_num),
    }
}

fn cmp_korean_text(left: &str, right: &str) -> Ordering {
    KOREAN_COLLATOR.compare(left, right)
}

struct QnaPage {
    items: Vec<QnaSearchItem>,
    incomplete: bool,
    count_by_type: BTreeMap<String, Number>,
    count_incomplete: bool,
}

async fn fetch_qna_page<T: HttpTransport>(
    transport: &T,
    source_url: &str,
    cancellation: &CancellationToken,
) -> Result<QnaPage, KasbError> {
    let payload = required_object(
        fetch_json(transport, source_url, cancellation).await?,
        source_url,
        "qnas search",
    )?;
    let source_items = required_array(payload.get("facilityQnas"), source_url, "facilityQnas")?;
    let items = source_items
        .iter()
        .filter_map(normalize_qna_search_item)
        .collect::<Vec<_>>();
    assert_any_normalized(
        source_items,
        &items,
        source_url,
        "Q&A search result fields changed.",
    )?;
    let source_counts = payload
        .get("facilityQnaCountData")
        .and_then(Value::as_object);
    let count_by_type: BTreeMap<String, Number> = source_counts
        .map(|values| {
            values
                .iter()
                .filter_map(|(key, value)| {
                    optional_number(Some(value)).map(|number| (key.clone(), number))
                })
                .collect()
        })
        .unwrap_or_default();
    let count_incomplete = source_counts.is_none_or(|values| count_by_type.len() != values.len());
    Ok(QnaPage {
        incomplete: items.len() != source_items.len(),
        items,
        count_by_type,
        count_incomplete,
    })
}

fn normalize_qna_search_item(value: &Value) -> Option<QnaSearchItem> {
    let item = value.as_object()?;
    let doc_number = item.get("docNumber").and_then(to_string_value)?;
    if is_url_dot_segment(&doc_number) {
        return None;
    }
    let item_type = optional_number(item.get("type"))?;
    let title = array_text(item.get("title"))
        .filter(|value| !value.is_empty())
        .or_else(|| optional_string(item.get("title")))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| doc_number.clone());
    let snippet = optional_string(item.get("fullContent_snippet"))
        .or_else(|| array_text(item.get("fullContent")))
        .or_else(|| optional_string(item.get("fullContent")))
        .unwrap_or_default();
    let tags = qna_tags(item.get("tags"));
    Some(QnaSearchItem {
        doc_number: doc_number.clone(),
        type_label: qna_type_label(&number_string(&item_type)),
        r#type: item_type,
        title: strip_html(&title),
        snippet: truncate_utf16(&normalize_qna_text(&strip_html(&snippet)), 280),
        tags,
        deprecated: optional_number(item.get("deprecatedYn"))
            .is_some_and(|value| number_f64(&value) == 1.0),
        content_link: optional_string(item.get("contentLink")),
        publish_date: optional_string(item.get("publishDate")),
        prefix: optional_string(item.get("prefixStr")),
        references: QnaSearchItemReferences {
            qna_url: qna_content_url(&doc_number, None),
        },
    })
}

fn normalize_qna(value: &Value, source_url: &str) -> Result<Qna, KasbError> {
    let item = required_object_ref(Some(value), source_url, "qna")?;
    let doc_number = item.get("docNumber").and_then(to_string_value);
    let item_type = optional_number(item.get("type"));
    let full_content = optional_string(item.get("fullContent"));
    let (Some(doc_number), Some(item_type), Some(full_content)) =
        (doc_number, item_type, full_content)
    else {
        return Err(source_changed(source_url, "Required Q&A response fields changed.").into());
    };
    let title = array_text(item.get("title"))
        .filter(|value| !value.is_empty())
        .or_else(|| optional_string(item.get("title")))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| doc_number.clone());
    let tags = qna_tags(item.get("tags"));
    Ok(Qna {
        doc_number,
        id: optional_number(item.get("id")),
        type_label: qna_type_label(&number_string(&item_type)),
        r#type: item_type,
        title: strip_html(&title),
        reference: optional_string(item.get("reference")),
        full_content: normalize_qna_text(&full_content),
        content_html: optional_string(item.get("contentHtml")),
        rel_stds: optional_string(item.get("relStds")),
        tags,
        content_link: optional_string(item.get("contentLink")),
        publish_date: optional_string(item.get("publishDate"))
            .or_else(|| optional_string(item.get("date"))),
        deprecated: optional_number(item.get("deprecatedYn"))
            .is_some_and(|value| number_f64(&value) == 1.0),
        prev_doc_number: optional_string(item.get("prevDocNumber")),
        next_doc_number: optional_string(item.get("nextDocNumber")),
    })
}

fn qna_in_date_range(item: &QnaSearchItem, request: &SearchQnaRequest) -> bool {
    let time = item.publish_date.as_deref().and_then(parse_publish_date);
    if request.from().is_some_and(|from| {
        time.is_none_or(|time| {
            time.date_naive() < NaiveDate::parse_from_str(from, "%Y-%m-%d").expect("validated date")
        })
    }) {
        return false;
    }
    if request.to().is_some_and(|to| {
        time.is_none_or(|time| {
            time.date_naive() > NaiveDate::parse_from_str(to, "%Y-%m-%d").expect("validated date")
        })
    }) {
        return false;
    }
    true
}

fn compare_qna_date(
    left: &QnaSearchItem,
    right: &QnaSearchItem,
    direction: QnaDateSort,
) -> Ordering {
    match (
        left.publish_date.as_deref().and_then(parse_publish_date),
        right.publish_date.as_deref().and_then(parse_publish_date),
    ) {
        (Some(left_time), Some(right_time)) => {
            let order = left_time.cmp(&right_time);
            let order = if direction == QnaDateSort::Desc {
                order.reverse()
            } else {
                order
            };
            order.then_with(|| left.doc_number.cmp(&right.doc_number))
        }
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => left.doc_number.cmp(&right.doc_number),
    }
}

fn parse_publish_date(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|value| value.with_timezone(&Utc))
        .or_else(|| {
            NaiveDate::parse_from_str(value, "%Y-%m-%d")
                .ok()?
                .and_hms_opt(0, 0, 0)
                .map(|value| value.and_utc())
        })
}
fn count_qna_items(items: &[QnaSearchItem]) -> BTreeMap<String, Number> {
    let mut result = BTreeMap::<String, Number>::new();
    for item in items {
        let key = number_string(&item.r#type);
        let value = result.get(&key).and_then(Number::as_u64).unwrap_or(0) + 1;
        result.insert(key, Number::from(value));
    }
    result
}
fn sum_qna_counts(counts: &BTreeMap<String, Number>, types: Option<&str>) -> u64 {
    types
        .map(|value| value.split(',').collect::<HashSet<_>>())
        .unwrap_or_else(|| counts.keys().map(String::as_str).collect())
        .into_iter()
        .map(|key| counts.get(key).map(number_f64).unwrap_or(0.0) as u64)
        .sum()
}
fn type_ids_for_page(
    request: &SearchQnaRequest,
    counts: &BTreeMap<String, Number>,
    items: &[QnaSearchItem],
) -> HashSet<String> {
    let mut result = request
        .types()
        .unwrap_or(DEFAULT_QNA_TYPES)
        .split(',')
        .map(str::to_owned)
        .collect::<HashSet<_>>();
    result.extend(counts.keys().cloned());
    result.extend(items.iter().map(|value| number_string(&value.r#type)));
    result
}
fn qna_type_labels(ids: HashSet<String>) -> BTreeMap<String, String> {
    ids.into_iter()
        .map(|id| {
            let label = qna_type_label(&id);
            (id, label)
        })
        .collect()
}
fn qna_type_label(value: &str) -> String {
    match value {
        "11" => "K-IFRS · 회계기준원",
        "12" => "일반기업회계기준 · 회계기준원",
        "13" => "K-IFRS · IFRS 해석위원회 논의결과",
        "14" => "일반기업회계기준 · 신속처리질의",
        "15" => "K-IFRS · 신속처리질의",
        "24" => "일반기업회계기준 · 금융감독원",
        "25" => "K-IFRS · 금융감독원",
        _ => return format!("Q&A type {value}"),
    }
    .to_owned()
}

fn qna_page_warnings(incomplete: bool, count_incomplete: bool) -> Vec<SearchQnaWarning> {
    let mut result = Vec::new();
    if incomplete {
        result.push(SearchQnaWarning {
            code: SearchQnaWarningCode::SourceMetadataIncomplete,
            message: "Some Q&A search rows could not be normalized and were omitted.".to_owned(),
        });
    }

    if count_incomplete {
        result.push(SearchQnaWarning { code: SearchQnaWarningCode::SourceMetadataIncomplete, message: "Q&A search count metadata could not be fully normalized, so pagination metadata was computed conservatively.".to_owned() });
    }
    result
}
fn qna_search_content(recency: bool) -> ContentMetadata {
    let mut notes = vec!["Search-highlight HTML is normalized to plain text in title and snippet, and snippet is truncated for quick scanning.".to_owned()];
    if recency {
        notes.push("sortDate/from/to are applied client-side to up to 500 Q&A search rows using source publishDate.".to_owned());
    }
    ContentMetadata {
        text_fields: vec![
            "result.items[].title".to_owned(),
            "result.items[].snippet".to_owned(),
        ],
        notes,
        ..ContentMetadata::default()
    }
}
fn normalize_qna_text(value: &str) -> String {
    trim_ecmascript_whitespace(&TRAILING_UNDEFINED.replace(value, "")).to_owned()
}
fn truncate_utf16(value: &str, max_units: usize) -> String {
    if value.encode_utf16().count() <= max_units {
        return value.to_owned();
    }
    let mut units = 0;
    let mut end = 0;
    for (index, character) in value.char_indices() {
        let next = units + character.len_utf16();
        if next > max_units {
            break;
        }
        units = next;
        end = index + character.len_utf8();
    }
    format!("{}…", trim_end_ecmascript_whitespace(&value[..end]))
}

fn suggest_standard_keywords(keyword: &str) -> Vec<String> {
    suggest_keywords(keyword, false)
}
fn suggest_qna_keywords(keyword: &str, total: u64) -> Vec<String> {
    if total > 0 {
        Vec::new()
    } else {
        suggest_keywords(keyword, true)
    }
}
fn suggest_keywords(keyword: &str, qna: bool) -> Vec<String> {
    let mut values = Vec::new();
    let mappings: &[(&str, &[&str])] = if qna {
        &[
            (
                "기타장기종업원급여",
                &["기타 장기 종업원 급여", "장기종업원급여", "종업원급여"],
            ),
            ("장기종업원급여", &["장기 종업원 급여", "종업원급여"]),
            ("장기근속급여", &["장기근속 급여", "종업원급여"]),
            ("장기근속", &["종업원급여"]),
        ]
    } else {
        &[
            ("기타장기종업원급여", &["종업원급여"]),
            ("장기종업원급여", &["종업원급여"]),
            ("장기근속급여", &["종업원급여"]),
            ("장기근속", &["종업원급여"]),
        ]
    };
    for (needle, suggestions) in mappings {
        if keyword.contains(needle) {
            for suggestion in *suggestions {
                if !values.iter().any(|value| value == suggestion) {
                    values.push((*suggestion).to_owned());
                }
            }
        }
    }
    let normalized_keyword = trim_ecmascript_whitespace(keyword);
    let without = ACCOUNTING_TREATMENT_SUFFIX
        .find(normalized_keyword)
        .map(|matched| trim_ecmascript_whitespace(&normalized_keyword[..matched.start()]))
        .filter(|value| !value.is_empty());
    if let Some(value) = without.filter(|value| {
        *value != normalized_keyword && !values.iter().any(|existing| existing == *value)
    }) {
        values.push(value.to_owned());
    }
    values.retain(|value| value != normalized_keyword);
    values
}

fn metadata(
    fetched_at: String,
    endpoint: String,
    partial: bool,
    content: Option<ContentMetadata>,
) -> ResultMetadata {
    ResultMetadata {
        fetched_at,
        source: SourceMetadata {
            system: "kasb".to_owned(),
            endpoint,
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
        content,
    }
}
fn array_text(value: Option<&Value>) -> Option<String> {
    value.and_then(Value::as_array).map(|values| {
        values
            .iter()
            .filter_map(to_string_value)
            .collect::<Vec<_>>()
            .join(" ")
    })
}
fn qna_tags(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::String(value)) => value
            .split(',')
            .map(crate::text::trim_ecmascript_whitespace)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
            .collect(),
        Some(Value::Array(values)) => values.iter().filter_map(to_string_value).collect(),
        _ => Vec::new(),
    }
}
fn section_not_found(source_url: &str) -> KasbFailure {
    KasbFailure::source_failure(
        KasbFailureCode::NotFound,
        "Could not find a section for the requested indexDocumentId or ref. Run get-standard-structure and use a returned indexDocumentId. Browser-route titleDocumentId is not allowed in v1.",
        false,
        source_url,
    )
}
fn remove_whitespace(value: &str) -> String {
    value
        .chars()
        .filter(|value| !is_ecmascript_whitespace(*value))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn korean_collation_matches_the_frozen_javascript_baseline_cases() {
        let mut values = vec![
            "가", "각", "ㄱ", "ＡBC", "abc", "Abc", "10장", "2장", "리스", "기준",
        ];
        values.sort_by(|left, right| cmp_korean_text(left, right));
        assert_eq!(
            values,
            [
                "10장", "2장", "ㄱ", "가", "각", "기준", "리스", "abc", "Abc", "ＡBC"
            ]
        );
    }

    #[test]
    fn strips_each_javascript_prefix_stage_once() {
        assert_eq!(
            strip_standard_prefix("일반기업회계기준 제2장 재무제표"),
            "재무제표"
        );
        assert_eq!(strip_standard_prefix("제1장 제2장 제목"), "제2장 제목");
    }

    #[test]
    fn qna_cleanup_uses_javascript_ascii_word_boundaries() {
        assert_eq!(normalize_qna_text("본문undefined undefined"), "본문");
        assert_eq!(
            normalize_qna_text("본문_undefined undefined"),
            "본문_undefined undefined"
        );
    }
}
