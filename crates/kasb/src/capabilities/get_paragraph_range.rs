use serde::{Deserialize, Serialize};
use serde_json::{Number, Value};

use super::ResultMetadata;
use super::get_section::SectionClause;
use super::validation::{
    non_blank_string, object_input, reject_unknown_keys, reject_url_dot_segment, required_string,
};
use crate::KasbFailure;

/// Inclusive paragraph range within one standard, resolved in source order.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetParagraphRangeRequest {
    std_num: String,
    from: String,
    to: String,
}

impl GetParagraphRangeRequest {
    pub fn new(
        std_num: impl Into<String>,
        from: impl Into<String>,
        to: impl Into<String>,
    ) -> Result<Self, KasbFailure> {
        let std_num = non_blank_string("stdNum", std_num.into())?;
        reject_url_dot_segment("stdNum", &std_num)?;
        let from = boundary("from", from.into())?;
        let to = boundary("to", to.into())?;
        let (from_namespace, to_namespace) = (paragraph_namespace(&from), paragraph_namespace(&to));
        if from_namespace != to_namespace {
            return Err(KasbFailure::invalid(
                "to",
                format!(
                    "Parameters \"from\" and \"to\" must be in the same paragraph namespace; got {} and {}.",
                    namespace_label(from_namespace),
                    namespace_label(to_namespace),
                ),
            ));
        }
        Ok(Self { std_num, from, to })
    }

    pub fn std_num(&self) -> &str {
        &self.std_num
    }

    pub fn from(&self) -> &str {
        &self.from
    }

    pub fn to(&self) -> &str {
        &self.to
    }

    pub fn from_json(input: Value) -> Result<Self, KasbFailure> {
        let object = object_input(input)?;
        reject_unknown_keys(&object, &["stdNum", "from", "to"])?;
        let std_num = required_string(&object, "stdNum")?;
        let from = required_string(&object, "from")?;
        let to = required_string(&object, "to")?;
        Self::new(std_num, from, to)
    }
}

impl<'de> Deserialize<'de> for GetParagraphRangeRequest {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Self::from_json(Value::deserialize(deserializer)?).map_err(serde::de::Error::custom)
    }
}

fn boundary(key: &str, value: String) -> Result<String, KasbFailure> {
    let value = non_blank_string(key, value)?;
    if value.contains('~') {
        return Err(KasbFailure::invalid(
            key,
            format!("Parameter \"{key}\" must be one exact paragraph number, not a range."),
        ));
    }
    reject_url_dot_segment(key, &value)?;
    Ok(value)
}

/// The paragraph-number family: the non-digit prefix before the first digit
/// (`BC339` → `BC`, `23` → ``). Korean-added paragraphs (`한132.2`) are
/// interleaved with the body in KASB source order, so a leading `한` marker
/// does not start a namespace of its own.
fn paragraph_namespace(para_num: &str) -> &str {
    let value = para_num.strip_prefix('한').unwrap_or(para_num);
    let end = value
        .find(|c: char| c.is_ascii_digit())
        .unwrap_or(value.len());
    &value[..end]
}

fn namespace_label(namespace: &str) -> String {
    if namespace.is_empty() {
        "the body namespace".to_owned()
    } else {
        format!("namespace \"{namespace}\"")
    }
}

/// One indexed section fetched to assemble the range, in structure order.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParagraphRangeSection {
    pub index_document_id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub r#ref: Option<String>,
    pub level: Number,
    pub section_url: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct GetParagraphRangePayload {
    pub request: GetParagraphRangeRequest,
    pub sections: Vec<ParagraphRangeSection>,
    pub clauses: Vec<SectionClause>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParagraphRangeReferences {
    pub std_num: String,
    pub from: String,
    pub to: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub standard_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub standard_kind: Option<String>,
    pub index_document_ids: Vec<String>,
    pub structure_url: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ParagraphRangeWarningCode {
    PartialClauseNormalization,
    SourceMetadataIncomplete,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ParagraphRangeWarning {
    pub code: ParagraphRangeWarningCode,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct GetParagraphRangeResult {
    pub result: GetParagraphRangePayload,
    pub metadata: ResultMetadata,
    pub references: ParagraphRangeReferences,
    pub warnings: Vec<ParagraphRangeWarning>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn accepts_same_namespace_boundaries_including_korean_added_paragraphs() {
        for (from, to) in [
            ("BC339", "BC346"),
            ("130", "한132.5"),
            ("한2.1", "4"),
            ("B3", "B3"),
        ] {
            let request = GetParagraphRangeRequest::from_json(
                json!({"stdNum": " 1102 ", "from": from, "to": format!(" {to} ")}),
            )
            .expect("same-namespace range should validate");
            assert_eq!(request.std_num(), "1102");
            assert_eq!(request.from(), from);
            assert_eq!(request.to(), to);
        }
    }

    #[test]
    fn rejects_invalid_boundaries_and_mixed_namespaces() {
        let cases = [
            (json!([]), "input"),
            (
                json!({"stdNum": "1102", "from": "1", "to": "2", "x": 1}),
                "x",
            ),
            (json!({"from": "1", "to": "2"}), "stdNum"),
            (json!({"stdNum": "1102", "to": "2"}), "from"),
            (json!({"stdNum": "1102", "from": "1"}), "to"),
            (json!({"stdNum": "1102", "from": " ", "to": "2"}), "from"),
            (json!({"stdNum": "1102", "from": "1~2", "to": "3"}), "from"),
            (json!({"stdNum": "1102", "from": "1", "to": ".."}), "to"),
            (json!({"stdNum": "..", "from": "1", "to": "2"}), "stdNum"),
            (json!({"stdNum": "1102", "from": "60", "to": "B3"}), "to"),
            (json!({"stdNum": "1102", "from": "BC339", "to": "B5"}), "to"),
            (json!({"stdNum": "1102", "from": "IE1", "to": "BC2"}), "to"),
        ];
        for (input, parameter) in cases {
            let failure =
                GetParagraphRangeRequest::from_json(input).expect_err("input should fail");
            assert_eq!(failure.code, crate::KasbFailureCode::InvalidInput);
            assert_eq!(failure.parameter.as_deref(), Some(parameter));
        }

        let failure = GetParagraphRangeRequest::new("1102", "60", "B3")
            .expect_err("mixed namespaces should fail");
        assert_eq!(
            failure.message,
            "Parameters \"from\" and \"to\" must be in the same paragraph namespace; got the body namespace and namespace \"B\"."
        );
    }
}
