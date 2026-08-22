use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{Map, Number, Value};

use crate::KasbFailure;
use crate::text::trim_ecmascript_whitespace;

pub use super::{Completeness, ContentMetadata, ResultMetadata, SourceBehavior, SourceMetadata};

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
        let para_num = required_para_num_value(para_num.into())?;
        let std_num = required_string_value("stdNum", std_num.into())?;
        reject_url_dot_segment("stdNum", &std_num)?;
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
        // Validate paraNum before reading stdNum to preserve the TypeScript
        // boundary's failure precedence for mixed-invalid inputs. Self::new
        // remains the final construction boundary.
        let para_num = required_json_string(&object, "paraNum")?;
        required_para_num_value(para_num.clone())?;
        let std_num = required_json_string(&object, "stdNum")?;
        Self::new(std_num, para_num)
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
    let unknown_keys = object
        .keys()
        .filter(|key| !matches!(key.as_str(), "stdNum" | "paraNum"));
    let key = unknown_keys
        .clone()
        .filter_map(|key| javascript_property_index(key).map(|index| (index, key)))
        .min_by_key(|(index, _)| *index)
        .map(|(_, key)| key)
        .or_else(|| unknown_keys.into_iter().next());
    if let Some(key) = key {
        let base = format!("Unknown parameter: \"{key}\".");
        let message = suggest_allowed_key(key)
            .map(|allowed| format!("{base} This typed API uses the JSON field \"{allowed}\"."))
            .unwrap_or(base);
        return Err(KasbFailure::invalid(key, message));
    }
    Ok(())
}

fn javascript_property_index(key: &str) -> Option<u32> {
    let index = key.parse::<u32>().ok()?;
    (index != u32::MAX && index.to_string() == key).then_some(index)
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
    let value = trim_ecmascript_whitespace(&value).to_owned();
    if value.is_empty() {
        return Err(KasbFailure::invalid(
            key,
            format!("Parameter \"{key}\" cannot be blank."),
        ));
    }
    Ok(value)
}

fn required_para_num_value(value: String) -> Result<String, KasbFailure> {
    let value = required_string_value("paraNum", value)?;
    if value.contains('~') {
        return Err(KasbFailure::invalid(
            "paraNum",
            "Parameter \"paraNum\" must be one exact paragraph number. Retrieve paragraph ranges with get-section ref.",
        ));
    }
    reject_url_dot_segment("paraNum", &value)?;
    Ok(value)
}

fn reject_url_dot_segment(key: &str, value: &str) -> Result<(), KasbFailure> {
    if matches!(value, "." | "..") {
        return Err(KasbFailure::invalid(
            key,
            format!("Parameter \"{key}\" cannot be a URL dot segment (\".\" or \"..\")."),
        ));
    }
    Ok(())
}

fn suggest_allowed_key(key: &str) -> Option<&'static str> {
    ["stdNum", "paraNum"]
        .into_iter()
        .find(|allowed| allowed.eq_ignore_ascii_case(key) || to_camel_case(key) == *allowed)
}

fn to_camel_case(key: &str) -> String {
    let mut result = String::with_capacity(key.len());
    let mut values = key.chars().peekable();
    while let Some(value) = values.next() {
        if matches!(value, '-' | '_') {
            let mut separators = String::from(value);
            while values.peek().is_some_and(|next| matches!(next, '-' | '_')) {
                separators.push(values.next().expect("peeked separator should exist"));
            }
            if values.peek().is_some_and(char::is_ascii_alphanumeric) {
                result.push(
                    values
                        .next()
                        .expect("peeked alphanumeric should exist")
                        .to_ascii_uppercase(),
                );
            } else {
                result.push_str(&separators);
            }
            continue;
        }
        result.push(value);
    }
    result
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
            (json!({"paraNum": " "}), "paraNum"),
            (json!({"paraNum": "22~30"}), "paraNum"),
            (json!({"stdNum": "1116", "paraNum": "."}), "paraNum"),
            (json!({"stdNum": "..", "paraNum": "23"}), "stdNum"),
            (json!({"stdNum": " . ", "paraNum": "23"}), "stdNum"),
            (
                json!({"stdNum": "1116", "paraNum": "\u{FEFF}..\u{3000}"}),
                "paraNum",
            ),
        ];
        for (input, parameter) in cases {
            let failure = GetParagraphRequest::from_json(input).expect_err("input should fail");
            assert_eq!(failure.parameter.as_deref(), Some(parameter));
            assert_eq!(failure.code, crate::KasbFailureCode::InvalidInput);
            assert!(!failure.retryable);
        }

        let failure = GetParagraphRequest::from_json(json!({"paraNum": "22~30"}))
            .expect_err("range recovery should precede a missing standard number");
        assert_eq!(
            failure.message,
            "Parameter \"paraNum\" must be one exact paragraph number. Retrieve paragraph ranges with get-section ref."
        );

        let failure = GetParagraphRequest::from_json(json!({
            "std-num": "1116",
            "paraNum": "23"
        }))
        .expect_err("CLI-style fields should fail with a typed-field hint");
        assert_eq!(
            failure.message,
            "Unknown parameter: \"std-num\". This typed API uses the JSON field \"stdNum\"."
        );

        let failure = GetParagraphRequest::from_json(json!({
            "std-num-": "1116",
            "paraNum": "23"
        }))
        .expect_err("non-alias fields should not receive a typed-field hint");
        assert_eq!(failure.message, "Unknown parameter: \"std-num-\".");

        let failure = GetParagraphRequest::from_json(json!({
            "z": true,
            "a": true,
            "stdNum": "1116",
            "paraNum": "23"
        }))
        .expect_err("the first inserted unknown field should win");
        assert_eq!(failure.parameter.as_deref(), Some("z"));

        let failure = GetParagraphRequest::from_json(json!({
            "z": true,
            "10": true,
            "2": true,
            "a": true,
            "stdNum": "1116",
            "paraNum": "23"
        }))
        .expect_err("JavaScript-compatible integer keys should precede string keys");
        assert_eq!(failure.parameter.as_deref(), Some("2"));
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

        let request = GetParagraphRequest::new("11\n16", "2\n3")
            .expect("embedded line terminators are opaque identifier characters");
        assert_eq!(request.std_num(), "11\n16");
        assert_eq!(request.para_num(), "2\n3");
    }
}
