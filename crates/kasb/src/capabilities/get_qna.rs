use serde::{Deserialize, Serialize};
use serde_json::{Number, Value};

use super::ResultMetadata;
use super::validation::{
    non_blank_string, object_input, optional_string, reject_unknown_keys, reject_url_dot_segment,
    required_string,
};
use crate::KasbFailure;

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetQnaRequest {
    doc_number: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    keyword: Option<String>,
}

impl GetQnaRequest {
    pub fn new(doc_number: impl Into<String>) -> Result<Self, KasbFailure> {
        let doc_number = validate_doc_number(non_blank_string("docNumber", doc_number.into())?)?;
        reject_url_dot_segment("docNumber", &doc_number)?;
        Ok(Self {
            doc_number,
            keyword: None,
        })
    }
    pub fn with_keyword(mut self, keyword: impl Into<String>) -> Self {
        let value = crate::text::trim_ecmascript_whitespace(&keyword.into()).to_owned();
        self.keyword = (!value.is_empty()).then_some(value);
        self
    }
    pub fn doc_number(&self) -> &str {
        &self.doc_number
    }
    pub fn keyword(&self) -> Option<&str> {
        self.keyword.as_deref()
    }
    pub fn from_json(input: Value) -> Result<Self, KasbFailure> {
        let object = object_input(input)?;
        reject_unknown_keys(&object, &["docNumber", "keyword"])?;
        let keyword = optional_string(&object, "keyword")?;
        let doc_number = validate_doc_number(required_string(&object, "docNumber")?)?;
        reject_url_dot_segment("docNumber", &doc_number)?;
        Ok(Self {
            doc_number,
            keyword,
        })
    }
}

fn validate_doc_number(value: String) -> Result<String, KasbFailure> {
    if value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(KasbFailure::invalid(
            "docNumber",
            "Parameter \"docNumber\" must be the full KASB Q&A document number. Numeric-only values are usually insufficient. Use search-qna to find the full docNumber (for example, SSI-35629), then pass it to get-qna.",
        ));
    }
    Ok(value)
}

impl<'de> Deserialize<'de> for GetQnaRequest {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Self::from_json(Value::deserialize(deserializer)?).map_err(serde::de::Error::custom)
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Qna {
    pub doc_number: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<Number>,
    pub r#type: Number,
    pub type_label: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reference: Option<String>,
    pub full_content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_html: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rel_stds: Option<String>,
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub publish_date: Option<String>,
    pub deprecated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prev_doc_number: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_doc_number: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct GetQnaPayload {
    pub request: GetQnaRequest,
    pub qna: Qna,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QnaReferences {
    pub doc_number: String,
    pub qna_url: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GetQnaWarningCode {
    SourceMetadataIncomplete,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct GetQnaWarning {
    pub code: GetQnaWarningCode,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct GetQnaResult {
    pub result: GetQnaPayload,
    pub metadata: ResultMetadata,
    pub references: QnaReferences,
    pub warnings: Vec<GetQnaWarning>,
}
