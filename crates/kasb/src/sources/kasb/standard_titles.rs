//! Release-versioned standard titles for search ranking.
//!
//! KASB exposes no endpoint listing standard titles; its own site ships them
//! as static client data. Bundling the structure-derived titles lets
//! `search-standards` rank without one paced structure request per result
//! row. Standards missing from the table are still enriched live.

use std::collections::HashMap;
use std::sync::LazyLock;

use serde::Deserialize;

#[derive(Deserialize)]
struct StandardTitles {
    titles: HashMap<String, Option<String>>,
}

static TITLES: LazyLock<HashMap<String, Option<String>>> = LazyLock::new(|| {
    serde_json::from_str::<StandardTitles>(include_str!("../../../data/standard-titles.json"))
        .expect("bundled standard titles are valid")
        .titles
});

/// Returns `None` for a standard the table does not know, and `Some(None)`
/// for a known standard whose structure has no title.
pub(crate) fn bundled_standard_title(std_num: &str) -> Option<Option<&'static str>> {
    TITLES.get(std_num).map(Option::as_deref)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_table_parses_and_distinguishes_unknown_from_untitled() {
        assert!(!TITLES.is_empty());
        assert_eq!(bundled_standard_title("not-a-standard"), None);
        for (std_num, title) in TITLES.iter() {
            // 900000 and above is reserved for fixtures that exercise the
            // live fallback.
            let number = std_num
                .parse::<u32>()
                .expect("bundled standard numbers are numeric");
            assert!(
                number < 900_000,
                "{std_num} collides with the fixture range"
            );
            assert!(
                title
                    .as_deref()
                    .is_none_or(|title| !title.trim().is_empty())
            );
        }
    }
}
