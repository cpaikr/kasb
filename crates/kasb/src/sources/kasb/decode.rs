use serde_json::{Map, Number, Value};

use crate::{KasbError, KasbFailure, KasbFailureCode};

pub(crate) fn required_object(
    value: Value,
    source_url: &str,
    context: &str,
) -> Result<Map<String, Value>, KasbError> {
    match value {
        Value::Object(value) => Ok(value),
        _ => Err(source_changed(
            source_url,
            format!("Could not find {context} response object."),
        )
        .into()),
    }
}

pub(crate) fn required_object_ref<'a>(
    value: Option<&'a Value>,
    source_url: &str,
    context: &str,
) -> Result<&'a Map<String, Value>, KasbError> {
    value.and_then(Value::as_object).ok_or_else(|| {
        source_changed(
            source_url,
            format!("Could not find {context} response object."),
        )
        .into()
    })
}

pub(crate) fn required_array<'a>(
    value: Option<&'a Value>,
    source_url: &str,
    context: &str,
) -> Result<&'a Vec<Value>, KasbError> {
    value.and_then(Value::as_array).ok_or_else(|| {
        source_changed(source_url, format!("Could not find {context} array.")).into()
    })
}

pub(crate) fn optional_string(value: Option<&Value>) -> Option<String> {
    value.and_then(Value::as_str).map(str::to_owned)
}

pub(crate) fn optional_number(value: Option<&Value>) -> Option<Number> {
    value.and_then(Value::as_number).cloned()
}

pub(crate) fn to_string_value(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => Some(value.clone()),
        Value::Number(value) => Some(number_string(value)),
        _ => None,
    }
}

pub(crate) fn number_string(value: &Number) -> String {
    ryu_js::Buffer::new()
        .format_finite(number_f64(value))
        .to_owned()
}

pub(crate) fn number_f64(value: &Number) -> f64 {
    value.as_f64().expect("JSON number is finite")
}

pub(crate) fn assert_any_normalized<T, U>(
    source: &[T],
    normalized: &[U],
    source_url: &str,
    message: &str,
) -> Result<(), KasbError> {
    if !source.is_empty() && normalized.is_empty() {
        Err(source_changed(source_url, message).into())
    } else {
        Ok(())
    }
}

pub(crate) fn source_changed(source_url: &str, message: impl Into<String>) -> KasbFailure {
    KasbFailure::source_failure(KasbFailureCode::SourceChanged, message, false, source_url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_numbers_use_the_observed_javascript_identifier_form() {
        for (source, expected) in [
            (serde_json::json!(1116), "1116"),
            (serde_json::json!(1116.0), "1116"),
            (serde_json::json!(-0.0), "0"),
            (serde_json::json!(1e20), "100000000000000000000"),
            (serde_json::json!(1e21), "1e+21"),
            (serde_json::json!(0.000001), "0.000001"),
            (serde_json::json!(0.0000001), "1e-7"),
            (serde_json::json!(u64::MAX), "18446744073709552000"),
        ] {
            assert_eq!(to_string_value(&source).as_deref(), Some(expected));
        }
    }
}
