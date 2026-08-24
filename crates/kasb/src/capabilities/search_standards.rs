use serde::{Deserialize, Serialize};
use serde_json::{Number, Value};

use super::ResultMetadata;
use super::validation::{
    non_blank_string, object_input, optional_integer, reject_unknown_keys, required_string,
};
use crate::KasbFailure;
use crate::text::trim_ecmascript_whitespace;

const LIMIT_DEFAULT: u64 = 20;
const LIMIT_MIN: u64 = 1;
const LIMIT_MAX: u64 = 100;

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SearchStandardsSort {
    #[default]
    Relevance,
    MatchCount,
    StdNum,
    Title,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchStandardsRequest {
    keyword: String,
    limit: u64,
    sort: SearchStandardsSort,
}

impl SearchStandardsRequest {
    pub fn new(keyword: impl Into<String>) -> Result<Self, KasbFailure> {
        Ok(Self {
            keyword: non_blank_string("keyword", keyword.into())?,
            limit: LIMIT_DEFAULT,
            sort: SearchStandardsSort::Relevance,
        })
    }

    pub fn with_limit(mut self, limit: u64) -> Result<Self, KasbFailure> {
        if !(LIMIT_MIN..=LIMIT_MAX).contains(&limit) {
            return Err(KasbFailure::invalid(
                "limit",
                format!("Parameter \"limit\" must be between {LIMIT_MIN} and {LIMIT_MAX}."),
            ));
        }
        self.limit = limit;
        Ok(self)
    }

    pub fn with_sort(mut self, sort: SearchStandardsSort) -> Self {
        self.sort = sort;
        self
    }

    pub fn keyword(&self) -> &str {
        &self.keyword
    }
    pub fn limit(&self) -> u64 {
        self.limit
    }
    pub fn sort(&self) -> SearchStandardsSort {
        self.sort
    }

    pub fn from_json(input: Value) -> Result<Self, KasbFailure> {
        let object = object_input(input)?;
        reject_unknown_keys(&object, &["keyword", "limit", "sort"])?;
        let sort = match object.get("sort") {
            None => SearchStandardsSort::Relevance,
            Some(Value::String(value)) => match trim_ecmascript_whitespace(value) {
                "relevance" => SearchStandardsSort::Relevance,
                "match-count" => SearchStandardsSort::MatchCount,
                "std-num" => SearchStandardsSort::StdNum,
                "title" => SearchStandardsSort::Title,
                _ => {
                    return Err(KasbFailure::invalid(
                        "sort",
                        "Parameter \"sort\" must be one of relevance, match-count, std-num, title.",
                    ));
                }
            },
            Some(_) => {
                return Err(KasbFailure::invalid(
                    "sort",
                    "Parameter \"sort\" must be a string.",
                ));
            }
        };
        Ok(Self {
            keyword: required_string(&object, "keyword")?,
            limit: optional_integer(&object, "limit", LIMIT_DEFAULT, LIMIT_MIN, LIMIT_MAX)?,
            sort,
        })
    }
}

impl<'de> Deserialize<'de> for SearchStandardsRequest {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Self::from_json(Value::deserialize(deserializer)?).map_err(serde::de::Error::custom)
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchStandardItem {
    pub std_num: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub standard_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub standard_kind: Option<String>,
    pub match_count: Number,
    pub references: SearchStandardReferences,
    pub next_actions: SearchStandardNextActions,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchStandardReferences {
    pub api_url: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchStandardNextActions {
    pub get_standard_structure: StructureNextAction,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct StructureNextAction {
    pub operation: String,
    pub input: StructureNextInput,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StructureNextInput {
    pub std_num: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchStandardsPayload {
    pub request: SearchStandardsRequest,
    pub total_match_count: Number,
    pub total_standard_count: usize,
    pub returned_count: usize,
    pub standards: Vec<SearchStandardItem>,
    pub suggested_keywords: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchStandardsReferences {
    pub search_url: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchStandardsWarningCode {
    TruncatedResults,
    SourceMetadataIncomplete,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SearchStandardsWarning {
    pub code: SearchStandardsWarningCode,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SearchStandardsResult {
    pub result: SearchStandardsPayload,
    pub metadata: ResultMetadata,
    pub references: SearchStandardsReferences,
    pub warnings: Vec<SearchStandardsWarning>,
}
