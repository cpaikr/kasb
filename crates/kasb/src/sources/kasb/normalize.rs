use std::sync::LazyLock;

use regex::{Captures, Regex};

use crate::text::{ECMASCRIPT_WHITESPACE_PATTERN, trim_ecmascript_whitespace};

static BLOCK_TAGS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(&format!(
        r"(?i)<{ECMASCRIPT_WHITESPACE_PATTERN}*/?{ECMASCRIPT_WHITESPACE_PATTERN}*(?:br|div|p|li|ul|ol|table|thead|tbody|tr|td|th|h[1-6])(?:{ECMASCRIPT_WHITESPACE_PATTERN}+[^>]*)?{ECMASCRIPT_WHITESPACE_PATTERN}*/?>",
    ))
    .expect("block tag regex is valid")
});
static ANY_TAG: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"<[^>]*>").expect("HTML tag regex is valid"));
static HEX_ENTITY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)&#x([0-9a-f]+);").expect("hex entity regex is valid"));
static DECIMAL_ENTITY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"&#([0-9]+);").expect("decimal entity regex is valid"));
static NBSP_ENTITY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)&nbsp;").expect("nbsp entity regex is valid"));
static AMP_ENTITY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)&amp;").expect("amp entity regex is valid"));
static LT_ENTITY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)&lt;").expect("lt entity regex is valid"));
static GT_ENTITY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)&gt;").expect("gt entity regex is valid"));
static QUOT_ENTITY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)&quot;").expect("quot entity regex is valid"));
static APOSTROPHE_ENTITY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)&#39;").expect("apostrophe entity regex is valid"));
static INLINE_SPACE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[\t\x0c\x0b ]+").expect("inline whitespace regex is valid"));
static AROUND_NEWLINE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r" *\n *").expect("newline whitespace regex is valid"));
static MANY_NEWLINES: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\n{3,}").expect("newline collapse regex is valid"));
static LIST_MARKER_AFTER_SENTENCE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(&format!(
        concat!(
            r"([.!?。．]){ecmascript_whitespace}*",
            r"(\((?:[0-9]{{1,3}}|[가-힣ㄱ-ㅎA-Za-z]|[ivxlcdmIVXLCDM]{{1,6}})\)|[①-⑳㈀-㈞㉠-㉭])"
        ),
        ecmascript_whitespace = ECMASCRIPT_WHITESPACE_PATTERN,
    ))
    .expect("sentence list marker regex is valid")
});
static LIST_MARKER_AT_LINE_START: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"(?m)^([\t\x0c\x0b ]*)",
        r"(\((?:[0-9]{1,3}|[가-힣ㄱ-ㅎA-Za-z]|[ivxlcdmIVXLCDM]{1,6})\)|[①-⑳㈀-㈞㉠-㉭])",
        r"(\S)"
    ))
    .expect("line list marker regex is valid")
});

pub(crate) fn normalize_kasb_plain_text(value: &str) -> String {
    let block_separated = BLOCK_TAGS.replace_all(value, "\n");
    let without_tags = ANY_TAG.replace_all(&block_separated, " ");
    let decoded = decode_html_entities(&without_tags);
    let separated = LIST_MARKER_AFTER_SENTENCE.replace_all(&decoded, "$1\n$2");
    let separated = LIST_MARKER_AT_LINE_START.replace_all(&separated, "$1$2 $3");
    let inline_collapsed = INLINE_SPACE.replace_all(&separated, " ");
    let trimmed_lines = AROUND_NEWLINE.replace_all(&inline_collapsed, "\n");
    let collapsed = MANY_NEWLINES.replace_all(&trimmed_lines, "\n\n");
    trim_ecmascript_whitespace(&collapsed).to_owned()
}

fn decode_html_entities(value: &str) -> String {
    let named = NBSP_ENTITY.replace_all(value, " ");
    let named = AMP_ENTITY.replace_all(&named, "&");
    let named = LT_ENTITY.replace_all(&named, "<");
    let named = GT_ENTITY.replace_all(&named, ">");
    let named = QUOT_ENTITY.replace_all(&named, "\"");
    let named = APOSTROPHE_ENTITY.replace_all(&named, "'");
    let decoded_hex = HEX_ENTITY.replace_all(&named, |captures: &Captures<'_>| {
        decode_code_point(&captures[1], 16)
    });
    DECIMAL_ENTITY
        .replace_all(&decoded_hex, |captures: &Captures<'_>| {
            decode_code_point(&captures[1], 10)
        })
        .into_owned()
}

fn decode_code_point(value: &str, radix: u32) -> String {
    u32::from_str_radix(value, radix)
        .ok()
        .and_then(char::from_u32)
        .map(|value| value.to_string())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mirrors_the_narrow_typescript_plain_text_rules() {
        assert_eq!(
            normalize_kasb_plain_text("<div>A&amp;B.</div><div>(1)First&nbsp;item</div>"),
            "A&B.\n(1) First item"
        );
        assert_eq!(
            normalize_kasb_plain_text("<p>See (23) and &#xAC00;.</p>"),
            "See (23) and 가."
        );
        assert_eq!(normalize_kasb_plain_text("A&nBsP;B&aMp;C"), "A B&C");
        assert_eq!(normalize_kasb_plain_text("A. (١)B &#١٢;"), "A. (١)B &#١٢;");
        assert_eq!(normalize_kasb_plain_text("&amp;lt;"), "<");
        assert_eq!(normalize_kasb_plain_text("&#xD800;"), "");
        assert_eq!(normalize_kasb_plain_text("\u{FEFF}A\u{FEFF}"), "A");
        assert_eq!(
            normalize_kasb_plain_text("\u{0085}A\u{0085}"),
            "\u{0085}A\u{0085}"
        );
        assert_eq!(normalize_kasb_plain_text("A.\u{FEFF}(1)B"), "A.\n(1) B");
        assert_eq!(
            normalize_kasb_plain_text("A.\u{0085}(1)B"),
            "A.\u{0085}(1)B"
        );
    }
}
