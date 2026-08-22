use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultMetadata {
    pub fetched_at: String,
    pub source: SourceMetadata,
    pub source_behavior: SourceBehavior,
    pub completeness: Completeness,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<ContentMetadata>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SourceMetadata {
    pub system: String,
    pub endpoint: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceBehavior {
    pub observation_status: String,
    pub api_base: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Completeness {
    Complete,
    Partial,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentMetadata {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub html_fields: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub text_fields: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub notes: Vec<String>,
}
