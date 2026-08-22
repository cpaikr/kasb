use std::collections::BTreeMap;

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use serde_json::{Number, Value};

use super::ResultMetadata;
use super::validation::{
    non_blank_string, object_input, optional_integer, optional_string, reject_unknown_keys,
    required_string,
};
use crate::KasbFailure;
use crate::text::trim_ecmascript_whitespace;

pub const DEFAULT_QNA_TYPES: &str = "11,12,13,14,15,24,25";

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum QnaDateSort {
    Asc,
    Desc,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchQnaRequest {
    keyword: String,
    page: u64,
    rows: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    types: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sort_date: Option<QnaDateSort>,
    #[serde(skip_serializing_if = "Option::is_none")]
    from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    to: Option<String>,
}

impl SearchQnaRequest {
    pub fn new(keyword: impl Into<String>) -> Result<Self, KasbFailure> {
        Ok(Self {
            keyword: non_blank_string("keyword", keyword.into())?,
            page: 1,
            rows: 10,
            types: None,
            sort_date: None,
            from: None,
            to: None,
        })
    }
    pub fn keyword(&self) -> &str {
        &self.keyword
    }

    pub fn with_page(mut self, page: u64) -> Result<Self, KasbFailure> {
        if !(1..=1000).contains(&page) {
            return Err(KasbFailure::invalid(
                "page",
                "Parameter \"page\" must be between 1 and 1000.",
            ));
        }
        self.page = page;
        Ok(self)
    }

    pub fn with_rows(mut self, rows: u64) -> Result<Self, KasbFailure> {
        if !(1..=50).contains(&rows) {
            return Err(KasbFailure::invalid(
                "rows",
                "Parameter \"rows\" must be between 1 and 50.",
            ));
        }
        self.rows = rows;
        Ok(self)
    }

    pub fn with_types(mut self, types: impl Into<String>) -> Result<Self, KasbFailure> {
        let types = trim_ecmascript_whitespace(&types.into()).to_owned();
        self.types = normalize_types((!types.is_empty()).then_some(types))?;
        Ok(self)
    }

    pub fn with_sort_date(mut self, sort_date: QnaDateSort) -> Self {
        self.sort_date = Some(sort_date);
        self
    }

    pub fn with_date_range(
        mut self,
        from: Option<impl Into<String>>,
        to: Option<impl Into<String>>,
    ) -> Result<Self, KasbFailure> {
        self.from = normalize_date(trim_optional(from.map(Into::into)), "from")?;
        self.to = normalize_date(trim_optional(to.map(Into::into)), "to")?;
        if self
            .from
            .as_ref()
            .zip(self.to.as_ref())
            .is_some_and(|(from, to)| from > to)
        {
            return Err(KasbFailure::invalid(
                "to",
                "Parameter \"to\" must be the same as or later than \"from\".",
            ));
        }
        Ok(self)
    }
    pub fn page(&self) -> u64 {
        self.page
    }
    pub fn rows(&self) -> u64 {
        self.rows
    }
    pub fn types(&self) -> Option<&str> {
        self.types.as_deref()
    }
    pub fn sort_date(&self) -> Option<QnaDateSort> {
        self.sort_date
    }
    pub fn from(&self) -> Option<&str> {
        self.from.as_deref()
    }
    pub fn to(&self) -> Option<&str> {
        self.to.as_deref()
    }
    pub fn has_recency_controls(&self) -> bool {
        self.sort_date.is_some() || self.from.is_some() || self.to.is_some()
    }

    pub fn from_json(input: Value) -> Result<Self, KasbFailure> {
        let object = object_input(input)?;
        reject_unknown_keys(
            &object,
            &["keyword", "page", "rows", "types", "sortDate", "from", "to"],
        )?;
        let types = normalize_types(optional_string(&object, "types")?)?;
        let sort_date = match optional_string(&object, "sortDate")?.as_deref() {
            None => None,
            Some("asc") => Some(QnaDateSort::Asc),
            Some("desc") => Some(QnaDateSort::Desc),
            Some(_) => {
                return Err(KasbFailure::invalid(
                    "sortDate",
                    "Parameter \"sortDate\" must be asc or desc.",
                ));
            }
        };
        let from = normalize_date(optional_string(&object, "from")?, "from")?;
        let to = normalize_date(optional_string(&object, "to")?, "to")?;
        if from
            .as_ref()
            .zip(to.as_ref())
            .is_some_and(|(from, to)| from > to)
        {
            return Err(KasbFailure::invalid(
                "to",
                "Parameter \"to\" must be the same as or later than \"from\".",
            ));
        }
        Ok(Self {
            keyword: required_string(&object, "keyword")?,
            page: optional_integer(&object, "page", 1, 1, 1000)?,
            rows: optional_integer(&object, "rows", 10, 1, 50)?,
            types,
            sort_date,
            from,
            to,
        })
    }
}

impl<'de> Deserialize<'de> for SearchQnaRequest {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Self::from_json(Value::deserialize(deserializer)?).map_err(serde::de::Error::custom)
    }
}

fn normalize_types(types: Option<String>) -> Result<Option<String>, KasbFailure> {
    let Some(types) = types else { return Ok(None) };
    let values = types
        .split(',')
        .map(trim_ecmascript_whitespace)
        .collect::<Vec<_>>();
    if values
        .iter()
        .any(|value| value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()))
    {
        return Err(KasbFailure::invalid(
            "types",
            format!(
                "Parameter \"types\" must be a CSV of numeric Q&A type ids. The observed default is {DEFAULT_QNA_TYPES}."
            ),
        ));
    }
    Ok(Some(values.join(",")))
}

fn trim_optional(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let value = trim_ecmascript_whitespace(&value).to_owned();
        (!value.is_empty()).then_some(value)
    })
}

fn normalize_date(value: Option<String>, parameter: &str) -> Result<Option<String>, KasbFailure> {
    let Some(value) = value else { return Ok(None) };
    if value.len() != 10 || NaiveDate::parse_from_str(&value, "%Y-%m-%d").is_err() {
        return Err(KasbFailure::invalid(
            parameter,
            format!("Parameter \"{parameter}\" must be a real date in YYYY-MM-DD form."),
        ));
    }
    Ok(Some(value))
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QnaSearchItem {
    pub doc_number: String,
    pub r#type: Number,
    pub type_label: String,
    pub title: String,
    pub snippet: String,
    pub tags: Vec<String>,
    pub deprecated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub publish_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prefix: Option<String>,
    pub references: QnaSearchItemReferences,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QnaSearchItemReferences {
    pub qna_url: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PaginationStatus {
    Known,
    Estimated,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchQnaPayload {
    pub request: SearchQnaRequest,
    pub items: Vec<QnaSearchItem>,
    pub returned_count: usize,
    pub total_count: u64,
    pub total_pages: u64,
    pub has_next_page: bool,
    pub pagination_status: PaginationStatus,
    pub count_by_type: BTreeMap<String, Number>,
    pub type_labels: BTreeMap<String, String>,
    pub suggested_keywords: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchQnaReferences {
    pub search_url: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchQnaWarningCode {
    SourceMetadataIncomplete,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SearchQnaWarning {
    pub code: SearchQnaWarningCode,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SearchQnaResult {
    pub result: SearchQnaPayload,
    pub metadata: ResultMetadata,
    pub references: SearchQnaReferences,
    pub warnings: Vec<SearchQnaWarning>,
}
