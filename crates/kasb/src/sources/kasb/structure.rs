use std::collections::HashSet;
use std::sync::LazyLock;

use regex::Regex;
use serde_json::{Number, Value};

use crate::KasbError;
use crate::capabilities::get_standard_structure::StandardSectionNode;
use crate::capabilities::validation::is_url_dot_segment;
use crate::http::{CancellationToken, HttpTransport};
use crate::text::ECMASCRIPT_WHITESPACE_CLASS;

use super::decode::{
    assert_any_normalized, number_f64, optional_number, optional_string, required_array,
    required_object, source_changed, to_string_value,
};
use super::transport::fetch_json;
use super::urls::standard_indexes_url;

static GENERAL_CHAPTER_TITLE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(&format!(
        r"^제[0-9]+장(?:[{ECMASCRIPT_WHITESPACE_CLASS}]|$)"
    ))
    .expect("standard kind regex is valid")
});

#[derive(Clone)]
pub(crate) struct StructureSnapshot {
    pub(crate) source_url: String,
    pub(crate) sections: Vec<StandardSectionNode>,
    pub(crate) raw_ids: HashSet<String>,
    pub(crate) incomplete: bool,
}

#[derive(Clone)]
pub(crate) struct SectionEnrichment {
    pub(crate) standard_title: Option<String>,
    pub(crate) standard_kind: Option<String>,
    pub(crate) exists: bool,
    pub(crate) title: Option<String>,
    pub(crate) reference: Option<String>,
    pub(crate) level: Option<Number>,
    pub(crate) sort: Option<Number>,
}

pub(crate) async fn fetch_structure_snapshot<T: HttpTransport>(
    transport: &T,
    std_num: &str,
    cancellation: &CancellationToken,
) -> Result<StructureSnapshot, KasbError> {
    let source_url = standard_indexes_url(std_num);
    let payload = required_object(
        fetch_json(transport, &source_url, cancellation).await?,
        &source_url,
        "standard indexes",
    )?;
    let source_items = required_array(
        payload.get("standardIndexes"),
        &source_url,
        "standardIndexes",
    )?;
    let mut sections = Vec::new();
    let mut raw_ids = HashSet::new();
    for item in source_items {
        let raw = raw_structure_id(item, &source_url, std_num)?;
        if let Some(value) = raw.as_ref() {
            raw_ids.insert(value.clone());
        }
        if let Some(value) = normalize_structure_node(item, raw, std_num) {
            sections.push(value);
        }
    }
    assert_any_normalized(
        source_items,
        &sections,
        &source_url,
        "Standard structure row fields changed.",
    )?;
    Ok(StructureSnapshot {
        source_url,
        incomplete: sections.len() != source_items.len(),
        sections,
        raw_ids,
    })
}

pub(crate) fn enrichment_from_snapshot(
    snapshot: &StructureSnapshot,
    document_id: &str,
) -> SectionEnrichment {
    let standard_title = snapshot
        .sections
        .iter()
        .find(|value| number_f64(&value.level) == 1.0)
        .map(|value| value.title.clone());
    let section = snapshot
        .sections
        .iter()
        .find(|value| value.index_document_id == document_id);
    SectionEnrichment {
        standard_kind: standard_title.as_deref().map(infer_standard_kind),
        standard_title,
        exists: section.is_some() || snapshot.raw_ids.contains(document_id),
        title: section.map(|value| value.title.clone()),
        reference: section.map(|value| value.r#ref.clone()),
        level: section.map(|value| value.level.clone()),
        sort: section.and_then(|value| value.sort.clone()),
    }
}

pub(crate) async fn section_enrichment<T: HttpTransport>(
    transport: &T,
    std_num: &str,
    document_id: &str,
    cancellation: &CancellationToken,
) -> Result<SectionEnrichment, KasbError> {
    let snapshot = fetch_structure_snapshot(transport, std_num, cancellation).await?;
    Ok(enrichment_from_snapshot(&snapshot, document_id))
}

pub(crate) fn infer_standard_kind(standard_title: &str) -> String {
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

fn raw_structure_id(
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
    if is_url_dot_segment(&document_id) {
        return Err(source_changed(
            source_url,
            "Standard structure row documentId is a URL dot segment.",
        )
        .into());
    }
    Ok(Some(document_id))
}

fn normalize_structure_node(
    value: &Value,
    document_id: Option<String>,
    std_num: &str,
) -> Option<StandardSectionNode> {
    let item = value.as_object()?;
    Some(StandardSectionNode {
        index_document_id: document_id?,
        std_num: std_num.to_owned(),
        title: optional_string(item.get("title"))?,
        r#ref: optional_string(item.get("ref")).unwrap_or_default(),
        level: optional_number(item.get("level"))?,
        document_type: optional_string(item.get("documentType")),
        parent_document_ids: item
            .get("parentDocumentIds")
            .and_then(Value::as_array)
            .map(|values| values.iter().filter_map(to_string_value).collect())
            .unwrap_or_default(),
        sort: optional_number(item.get("sort")),
    })
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
        assert_eq!(infer_standard_kind("제2장\u{0085}재무제표"), "standard");
    }
}
