pub(crate) const ECMASCRIPT_WHITESPACE_CLASS: &str = r"\x09-\x0D\x20\u{00A0}\u{1680}\u{2000}-\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}\u{FEFF}";

pub(crate) fn trim_ecmascript_whitespace(value: &str) -> &str {
    value.trim_matches(is_ecmascript_whitespace)
}

pub(crate) fn trim_end_ecmascript_whitespace(value: &str) -> &str {
    value.trim_end_matches(is_ecmascript_whitespace)
}

pub(crate) fn is_ecmascript_whitespace(value: char) -> bool {
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

#[cfg(test)]
mod tests {
    use regex::Regex;

    use super::*;

    #[test]
    fn regex_class_and_character_matcher_cover_the_same_scalars() {
        let regex = Regex::new(&format!(r"^[{ECMASCRIPT_WHITESPACE_CLASS}]$"))
            .expect("ECMAScript whitespace regex is valid");
        for value in (0..=char::MAX as u32).filter_map(char::from_u32) {
            assert_eq!(
                regex.is_match(value.encode_utf8(&mut [0; 4])),
                is_ecmascript_whitespace(value),
                "whitespace definitions differ for U+{:04X}",
                value as u32
            );
        }
    }

    #[test]
    fn trim_helpers_preserve_non_ecmascript_unicode_whitespace() {
        assert_eq!(trim_ecmascript_whitespace("\u{feff}value\u{3000}"), "value");
        assert_eq!(trim_end_ecmascript_whitespace("value\u{2029}"), "value");
        assert_eq!(
            trim_ecmascript_whitespace("\u{0085}value\u{0085}"),
            "\u{0085}value\u{0085}"
        );
        assert_eq!(
            trim_end_ecmascript_whitespace("value\u{0085}"),
            "value\u{0085}"
        );
    }
}
