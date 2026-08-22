use percent_encoding::{AsciiSet, CONTROLS, utf8_percent_encode};

pub(crate) const KASB_API_BASE_URL: &str = "https://db.kasb.or.kr/api";

const URI_COMPONENT_ENCODE_SET: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'"')
    .add(b'#')
    .add(b'$')
    .add(b'%')
    .add(b'&')
    .add(b'+')
    .add(b',')
    .add(b'/')
    .add(b':')
    .add(b';')
    .add(b'<')
    .add(b'=')
    .add(b'>')
    .add(b'?')
    .add(b'@')
    .add(b'[')
    .add(b'\\')
    .add(b']')
    .add(b'^')
    .add(b'`')
    .add(b'{')
    .add(b'|')
    .add(b'}');

const FORM_VALUE_ENCODE_SET: &AsciiSet = &URI_COMPONENT_ENCODE_SET
    .add(b'!')
    .add(b'\'')
    .add(b'(')
    .add(b')')
    .add(b'~');

pub(crate) fn paragraph_content_url(std_num: &str, para_num: &str) -> String {
    format!(
        "{KASB_API_BASE_URL}/paragraphs/content/{}/{}",
        encode_path_segment(std_num),
        encode_path_segment(para_num)
    )
}

pub(crate) fn standard_indexes_url(std_num: &str) -> String {
    format!(
        "{KASB_API_BASE_URL}/standard-indexes/{}",
        encode_path_segment(std_num)
    )
}

pub(crate) fn standards_search_url(keyword: &str) -> String {
    format!(
        "{KASB_API_BASE_URL}/standard?searchWord={}",
        encode_query_value(keyword)
    )
}

pub(crate) fn standard_indexes_search_url(std_num: &str, keyword: &str) -> String {
    format!(
        "{KASB_API_BASE_URL}/standard-indexes/{}/searchWord?searchWord={}",
        encode_path_segment(std_num),
        encode_query_value(keyword)
    )
}

pub(crate) fn paragraphs_url(
    std_num: &str,
    index_document_id: &str,
    keyword: Option<&str>,
) -> String {
    let base = format!(
        "{KASB_API_BASE_URL}/paragraphs/{}/{}",
        encode_path_segment(std_num),
        encode_path_segment(index_document_id)
    );
    keyword.map_or(base.clone(), |keyword| {
        format!("{base}?searchWord={}", encode_query_value(keyword))
    })
}

pub(crate) fn qnas_search_url(keyword: &str, page: u64, rows: u64, types: Option<&str>) -> String {
    format!(
        "{KASB_API_BASE_URL}/qnas/v2?types={}&searchWord={}&page={page}&rows={rows}",
        encode_query_value(types.unwrap_or("11,12,13,14,15,24,25")),
        encode_query_value(keyword),
    )
}

pub(crate) fn qna_content_url(doc_number: &str, keyword: Option<&str>) -> String {
    let base = format!(
        "{KASB_API_BASE_URL}/qnas/v2/{}",
        encode_path_segment(doc_number)
    );
    keyword.map_or(base.clone(), |keyword| {
        format!("{base}?searchWord={}", encode_query_value(keyword))
    })
}

fn encode_path_segment(value: &str) -> String {
    utf8_percent_encode(value, URI_COMPONENT_ENCODE_SET).to_string()
}

fn encode_query_value(value: &str) -> String {
    utf8_percent_encode(value, FORM_VALUE_ENCODE_SET)
        .to_string()
        .replace("%20", "+")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_each_source_identifier_as_one_path_segment() {
        assert_eq!(
            paragraph_content_url(" 11/16 ", "한2.1"),
            "https://db.kasb.or.kr/api/paragraphs/content/%2011%2F16%20/%ED%95%9C2.1"
        );
        assert_eq!(
            paragraph_content_url("1116", "BC240A"),
            "https://db.kasb.or.kr/api/paragraphs/content/1116/BC240A"
        );
    }

    #[test]
    fn uses_whatwg_form_encoding_for_query_values() {
        assert_eq!(
            standards_search_url("a b~!*'()"),
            "https://db.kasb.or.kr/api/standard?searchWord=a+b%7E%21*%27%28%29"
        );
        assert_eq!(
            qnas_search_url("리스", 2, 5, Some("15,25")),
            "https://db.kasb.or.kr/api/qnas/v2?types=15%2C25&searchWord=%EB%A6%AC%EC%8A%A4&page=2&rows=5"
        );
    }
}
