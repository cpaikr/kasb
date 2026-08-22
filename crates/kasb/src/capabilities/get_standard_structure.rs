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
pub struct GetStandardStructureRequest {
    std_num: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    keyword: Option<String>,
}

impl GetStandardStructureRequest {
    pub fn new(std_num: impl Into<String>) -> Result<Self, KasbFailure> {
        let std_num = non_blank_string("stdNum", std_num.into())?;
        reject_url_dot_segment("stdNum", &std_num)?;
        Ok(Self {
            std_num,
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
    pub fn keyword(&self) -> Option<&str> {
        self.keyword.as_deref()
    }
    pub fn from_json(input: Value) -> Result<Self, KasbFailure> {
        let object = object_input(input)?;
        reject_unknown_keys(&object, &["stdNum", "keyword"])?;
        let keyword = optional_string(&object, "keyword")?;
        let std_num = required_string(&object, "stdNum")?;
        reject_url_dot_segment("stdNum", &std_num)?;
        Ok(Self { std_num, keyword })
    }
}

impl<'de> Deserialize<'de> for GetStandardStructureRequest {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Self::from_json(Value::deserialize(deserializer)?).map_err(serde::de::Error::custom)
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StandardSectionNode {
    pub index_document_id: String,
    pub std_num: String,
    pub title: String,
    pub r#ref: String,
    pub level: Number,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub document_type: Option<String>,
    pub parent_document_ids: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort: Option<Number>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetStandardStructurePayload {
    pub request: GetStandardStructureRequest,
    pub sections: Vec<StandardSectionNode>,
    pub returned_count: usize,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StandardStructureReferences {
    pub std_num: String,
    pub structure_url: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StandardStructureWarningCode {
    SearchFilteredStructure,
    SourceMetadataIncomplete,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct StandardStructureWarning {
    pub code: StandardStructureWarningCode,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct GetStandardStructureResult {
    pub result: GetStandardStructurePayload,
    pub metadata: ResultMetadata,
    pub references: StandardStructureReferences,
    pub warnings: Vec<StandardStructureWarning>,
}
