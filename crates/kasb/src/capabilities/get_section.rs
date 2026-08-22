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
pub struct GetSectionRequest {
    std_num: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    index_document_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    r#ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    keyword: Option<String>,
}

impl GetSectionRequest {
    pub fn by_index_document_id(
        std_num: impl Into<String>,
        index_document_id: impl Into<String>,
    ) -> Result<Self, KasbFailure> {
        let std_num = non_blank_string("stdNum", std_num.into())?;
        let index_document_id = non_blank_string("indexDocumentId", index_document_id.into())?;
        reject_url_dot_segment("stdNum", &std_num)?;
        reject_url_dot_segment("indexDocumentId", &index_document_id)?;
        Ok(Self {
            std_num,
            index_document_id: Some(index_document_id),
            r#ref: None,
            keyword: None,
        })
    }
    pub fn by_ref(
        std_num: impl Into<String>,
        reference: impl Into<String>,
    ) -> Result<Self, KasbFailure> {
        let std_num = non_blank_string("stdNum", std_num.into())?;
        reject_url_dot_segment("stdNum", &std_num)?;
        Ok(Self {
            std_num,
            index_document_id: None,
            r#ref: Some(non_blank_string("ref", reference.into())?),
            keyword: None,
        })
    }
    pub fn with_keyword(mut self, keyword: impl Into<String>) -> Self {
        let value = crate::text::trim_ecmascript_whitespace(&keyword.into()).to_owned();
        self.keyword = (!value.is_empty()).then_some(value);
        self
    }
    pub fn std_num(&self) -> &str {
        &self.std_num
    }
    pub fn index_document_id(&self) -> Option<&str> {
        self.index_document_id.as_deref()
    }
    pub fn reference(&self) -> Option<&str> {
        self.r#ref.as_deref()
    }
    pub fn keyword(&self) -> Option<&str> {
        self.keyword.as_deref()
    }
    pub fn from_json(input: Value) -> Result<Self, KasbFailure> {
        let object = object_input(input)?;
        reject_unknown_keys(&object, &["stdNum", "indexDocumentId", "ref", "keyword"])?;
        let keyword = optional_string(&object, "keyword")?;
        let index_document_id = optional_string(&object, "indexDocumentId")?;
        let reference = optional_string(&object, "ref")?;
        if index_document_id.is_none() && reference.is_none() {
            return Err(KasbFailure::invalid(
                "indexDocumentId",
                "Exactly one of required parameters \"indexDocumentId\" or \"ref\" is required. \"indexDocumentId\" comes from get-standard-structure results; browser-route titleDocumentId cannot be used.",
            ));
        }
        if index_document_id.is_some() && reference.is_some() {
            return Err(KasbFailure::invalid(
                "ref",
                "Use exactly one of parameters \"indexDocumentId\" and \"ref\".",
            ));
        }
        let std_num = required_string(&object, "stdNum")?;
        reject_url_dot_segment("stdNum", &std_num)?;
        if let Some(value) = index_document_id.as_deref() {
            reject_url_dot_segment("indexDocumentId", value)?;
        }
        Ok(Self {
            std_num,
            index_document_id,
            r#ref: reference,
            keyword,
        })
    }
}

impl<'de> Deserialize<'de> for GetSectionRequest {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Self::from_json(Value::deserialize(deserializer)?).map_err(serde::de::Error::custom)
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SectionClauseKind {
    Paragraph,
    Title,
    Unknown,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionClause {
    pub kind: SectionClauseKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unique_key: Option<String>,
    pub std_num: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub para_num: Option<String>,
    pub index_document_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub para_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub full_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort: Option<Number>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub faq_doc_numbers: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub faq_count: Option<Number>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionMetadata {
    pub std_num: String,
    pub index_document_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub standard_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub standard_kind: Option<String>,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub r#ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<Number>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort: Option<Number>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct GetSectionPayload {
    pub request: GetSectionRequest,
    pub section: SectionMetadata,
    pub clauses: Vec<SectionClause>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionReferences {
    pub std_num: String,
    pub index_document_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub standard_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub standard_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub section_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub section_ref: Option<String>,
    pub section_url: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SectionWarningCode {
    AmbiguousRefResolved,
    EmptySection,
    PartialClauseNormalization,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SectionWarning {
    pub code: SectionWarningCode,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct GetSectionResult {
    pub result: GetSectionPayload,
    pub metadata: ResultMetadata,
    pub references: SectionReferences,
    pub warnings: Vec<SectionWarning>,
}
