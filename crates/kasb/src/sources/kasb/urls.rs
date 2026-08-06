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

fn encode_path_segment(value: &str) -> String {
    utf8_percent_encode(value, URI_COMPONENT_ENCODE_SET).to_string()
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
}
