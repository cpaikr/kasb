use std::collections::HashSet;

use serde_json::{Map, Value};

use crate::KasbFailure;
use crate::text::trim_ecmascript_whitespace;

pub(crate) fn object_input(input: Value) -> Result<Map<String, Value>, KasbFailure> {
    match input {
        Value::Object(value) => Ok(value),
        _ => Err(KasbFailure::invalid(
            "input",
            "Input must be an object containing semantic parameters.",
        )),
    }
}

pub(crate) fn reject_unknown_keys(
    object: &Map<String, Value>,
    allowed: &[&str],
) -> Result<(), KasbFailure> {
    let allowed_set = allowed.iter().copied().collect::<HashSet<_>>();
    let unknown = object
        .keys()
        .filter(|key| !allowed_set.contains(key.as_str()));
    let key = unknown
        .clone()
        .filter_map(|key| javascript_property_index(key).map(|index| (index, key)))
        .min_by_key(|(index, _)| *index)
        .map(|(_, key)| key)
        .or_else(|| unknown.into_iter().next());
    let Some(key) = key else { return Ok(()) };

    let base = format!("Unknown parameter: \"{key}\".");
    let message = suggest_allowed_key(key, allowed)
        .map(|value| format!("{base} This typed API uses the JSON field \"{value}\"."))
        .or_else(|| {
            (key == "titleDocumentId" && allowed.contains(&"indexDocumentId")).then(|| {
                format!("{base} titleDocumentId is a browser-route id and cannot be used. Use the indexDocumentId returned by get-standard-structure.")
            })
        })
        .unwrap_or(base);
    Err(KasbFailure::invalid(key, message))
}

pub(crate) fn required_string(
    object: &Map<String, Value>,
    key: &str,
) -> Result<String, KasbFailure> {
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
    non_blank_string(key, value.clone())
}

pub(crate) fn optional_string(
    object: &Map<String, Value>,
    key: &str,
) -> Result<Option<String>, KasbFailure> {
    let Some(value) = object.get(key) else {
        return Ok(None);
    };
    let Value::String(value) = value else {
        return Err(KasbFailure::invalid(
            key,
            format!("Parameter \"{key}\" must be a string."),
        ));
    };
    let value = trim_ecmascript_whitespace(value).to_owned();
    Ok((!value.is_empty()).then_some(value))
}

pub(crate) fn non_blank_string(key: &str, value: String) -> Result<String, KasbFailure> {
    let value = trim_ecmascript_whitespace(&value).to_owned();
    if value.is_empty() {
        return Err(KasbFailure::invalid(
            key,
            format!("Parameter \"{key}\" cannot be blank."),
        ));
    }
    Ok(value)
}

pub(crate) fn optional_integer(
    object: &Map<String, Value>,
    key: &str,
    default: u64,
    min: u64,
    max: u64,
) -> Result<u64, KasbFailure> {
    let value = object.get(key).unwrap_or(&Value::Null);
    let value = if value.is_null() && !object.contains_key(key) {
        return Ok(default);
    } else {
        let number = value.as_f64().ok_or_else(|| {
            KasbFailure::invalid(key, format!("Parameter \"{key}\" must be an integer."))
        })?;
        if !number.is_finite() || number.fract() != 0.0 {
            return Err(KasbFailure::invalid(
                key,
                format!("Parameter \"{key}\" must be an integer."),
            ));
        }
        if number < min as f64 || number > max as f64 {
            return Err(KasbFailure::invalid(
                key,
                format!("Parameter \"{key}\" must be between {min} and {max}."),
            ));
        }
        number as u64
    };
    Ok(value)
}

pub(crate) fn reject_url_dot_segment(key: &str, value: &str) -> Result<(), KasbFailure> {
    if is_url_dot_segment(value) {
        return Err(KasbFailure::invalid(
            key,
            format!("Parameter \"{key}\" cannot be a URL dot segment (\".\" or \"..\")."),
        ));
    }
    Ok(())
}

pub(crate) fn is_url_dot_segment(value: &str) -> bool {
    matches!(value, "." | "..")
}

fn javascript_property_index(key: &str) -> Option<u32> {
    let index = key.parse::<u32>().ok()?;
    (index != u32::MAX && index.to_string() == key).then_some(index)
}

fn suggest_allowed_key<'a>(key: &str, allowed: &'a [&str]) -> Option<&'a str> {
    let semantic = match key {
        "limit" => Some("rows"),
        "query" | "searchWord" => Some("keyword"),
        _ => None,
    };
    if let Some(alias) = semantic.filter(|alias| allowed.contains(alias)) {
        return Some(alias);
    }
    let camel = to_camel_case(key);
    allowed
        .iter()
        .copied()
        .find(|candidate| candidate.eq_ignore_ascii_case(key) || camel == *candidate)
}

fn to_camel_case(key: &str) -> String {
    let mut result = String::with_capacity(key.len());
    let mut values = key.chars().peekable();
    while let Some(value) = values.next() {
        if matches!(value, '-' | '_') {
            while values.peek().is_some_and(|next| matches!(next, '-' | '_')) {
                values.next();
            }
            if values.peek().is_some_and(char::is_ascii_alphanumeric) {
                result.push(
                    values
                        .next()
                        .expect("peeked value exists")
                        .to_ascii_uppercase(),
                );
            } else {
                result.push(value);
            }
        } else {
            result.push(value);
        }
    }
    result
}
