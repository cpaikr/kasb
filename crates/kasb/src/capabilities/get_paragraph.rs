use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{Map, Number, Value};

use crate::KasbFailure;

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetParagraphRequest {
    std_num: String,
    para_num: String,
}

impl GetParagraphRequest {
    pub fn new(
        std_num: impl Into<String>,
        para_num: impl Into<String>,
    ) -> Result<Self, KasbFailure> {
        let para_num = required_string_value("paraNum", para_num.into())?;
        if para_num.contains('~') {
            return Err(KasbFailure::invalid(
                "paraNum",
                "Parameter \"paraNum\" must be one exact paragraph number. Retrieve paragraph ranges with get-section ref.",
            ));
        }
        let std_num = required_string_value("stdNum", std_num.into())?;
        Ok(Self { std_num, para_num })
    }

    pub fn std_num(&self) -> &str {
        &self.std_num
    }

    pub fn para_num(&self) -> &str {
        &self.para_num
    }

    pub fn from_json(input: Value) -> Result<Self, KasbFailure> {
        let object = match input {
            Value::Object(object) => object,
            _ => {
                return Err(KasbFailure::invalid(
                    "input",
                    "Input must be an object containing semantic parameters.",
                ));
            }
        };
        reject_unknown_keys(&object)?;
        // TypeScript validates paraNum first because its range recovery is the
        // most specific invalid-input guidance at the serialized boundary.
        let para_num = required_string_value("paraNum", required_json_string(&object, "paraNum")?)?;
        if para_num.contains('~') {
            return Err(KasbFailure::invalid(
                "paraNum",
                "Parameter \"paraNum\" must be one exact paragraph number. Retrieve paragraph ranges with get-section ref.",
            ));
        }
        let std_num = required_string_value("stdNum", required_json_string(&object, "stdNum")?)?;
        Ok(Self { std_num, para_num })
    }
}

impl<'de> Deserialize<'de> for GetParagraphRequest {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        Self::from_json(Value::deserialize(deserializer)?).map_err(serde::de::Error::custom)
    }
}

fn reject_unknown_keys(object: &Map<String, Value>) -> Result<(), KasbFailure> {
    if let Some(key) = object
        .keys()
        .find(|key| !matches!(key.as_str(), "stdNum" | "paraNum"))
    {
        return Err(KasbFailure::invalid(
            key,
            format!("Unknown parameter: \"{key}\"."),
        ));
    }
    Ok(())
}

fn required_json_string(object: &Map<String, Value>, key: &str) -> Result<String, KasbFailure> {
    let Some(value) = object.get(key) else {
        return Err(KasbFailure::invalid(
            key,
            format!("Missing required parameter \"{key}\"."),
        ));
    };
    let Value::String(value) = value else {
        return Err(KasbFailure::invalid(
            key,
            format!("Parameter \"{key}\" must be a string."),
        ));
    };
    Ok(value.clone())
}

fn required_string_value(key: &str, value: String) -> Result<String, KasbFailure> {
    let value = value.trim_matches(is_ecmascript_whitespace).to_owned();
    if value.is_empty() {
        return Err(KasbFailure::invalid(
            key,
            format!("Parameter \"{key}\" cannot be blank."),
        ));
    }
    Ok(value)
}

fn is_ecmascript_whitespace(value: char) -> bool {
    matches!(
        value,
        '\u{0009}'..='\u{000D}'
            | '\u{0020}'
            | '\u{00A0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200A}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202F}'
            | '\u{205F}'
            | '\u{3000}'
            | '\u{FEFF}'
    )
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Paragraph {
    pub std_num: String,
    pub para_num: String,
    pub unique_key: String,
    pub index_document_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub standard_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub standard_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub section_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub section_ref: Option<String>,
    pub para_content: String,
    pub full_content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort: Option<Number>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub faq_doc_numbers: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub faq_count: Option<Number>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct GetParagraphPayload {
    pub request: GetParagraphRequest,
    pub paragraph: Paragraph,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ResultMetadata {
    #[serde(rename = "fetchedAt")]
    pub fetched_at: String,
    pub source: SourceMetadata,
    #[serde(rename = "sourceBehavior")]
    pub source_behavior: SourceBehavior,
    pub completeness: Completeness,
    pub content: ContentMetadata,
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

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentMetadata {
    pub html_fields: Vec<String>,
    pub text_fields: Vec<String>,
    pub notes: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParagraphReferences {
    pub std_num: String,
    pub para_num: String,
    pub unique_key: String,
    pub index_document_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub standard_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub standard_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub section_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub section_ref: Option<String>,
    pub paragraph_url: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ParagraphWarning {
    pub code: ParagraphWarningCode,
    pub message: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ParagraphWarningCode {
    ParagraphMetadataIncomplete,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct GetParagraphResult {
    pub result: GetParagraphPayload,
    pub metadata: ResultMetadata,
    pub references: ParagraphReferences,
    pub warnings: Vec<ParagraphWarning>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn validates_and_trims_raw_json_inputs() {
        assert_eq!(
            GetParagraphRequest::from_json(json!({"stdNum": " 1116 ", "paraNum": " 한2.1 "}))
                .expect("request should validate"),
            GetParagraphRequest {
                std_num: "1116".to_owned(),
                para_num: "한2.1".to_owned(),
            }
        );
    }

    #[test]
    fn rejects_non_objects_unknown_keys_types_blanks_and_ranges() {
        let cases = [
            (json!([]), "input"),
            (
                json!({"stdNum": "1116", "paraNum": "23", "extra": true}),
                "extra",
            ),
            (json!({"stdNum": 1116, "paraNum": "23"}), "stdNum"),
            (json!({"stdNum": "1116", "paraNum": " "}), "paraNum"),
            (json!({"stdNum": "1116", "paraNum": "22~30"}), "paraNum"),
            (json!({}), "paraNum"),
            (json!({"stdNum": " ", "paraNum": " "}), "paraNum"),
        ];
        for (input, parameter) in cases {
            let failure = GetParagraphRequest::from_json(input).expect_err("input should fail");
            assert_eq!(failure.parameter.as_deref(), Some(parameter));
            assert_eq!(failure.code, crate::KasbFailureCode::InvalidInput);
            assert!(!failure.retryable);
        }
    }

    #[test]
    fn deserialization_cannot_construct_an_invalid_typed_request() {
        let error = serde_json::from_value::<GetParagraphRequest>(
            json!({"stdNum": "1116", "paraNum": "22~30"}),
        )
        .expect_err("typed request deserialization must preserve validation");
        assert!(error.to_string().contains("one exact paragraph number"));
    }

    #[test]
    fn trims_the_ecmascript_whitespace_set_exactly() {
        let request = GetParagraphRequest::new("\u{FEFF}1116\u{FEFF}", "\u{3000}23\u{2029}")
            .expect("ECMAScript whitespace should trim");
        assert_eq!(request.std_num(), "1116");
        assert_eq!(request.para_num(), "23");

        let request = GetParagraphRequest::new("\u{0085}1116\u{0085}", "23")
            .expect("non-ECMAScript whitespace is an opaque identifier character");
        assert_eq!(request.std_num(), "\u{0085}1116\u{0085}");
    }
}
