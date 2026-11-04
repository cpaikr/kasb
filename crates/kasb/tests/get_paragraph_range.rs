use std::collections::HashMap;
use std::future::Future;
use std::sync::{Arc, Mutex};

use kasb::capabilities::get_paragraph_range::{GetParagraphRangeResult, ParagraphRangeWarningCode};
use kasb::http::{CancellationToken, HttpResponse, HttpTransport, TransportError};
use kasb::{FixedClock, KasbClient, KasbError, KasbFailure, KasbFailureCode};
use serde_json::{Value, json};

const FIXED_TIME: &str = "2026-11-04T00:00:00.000Z";
const BASE: &str = "https://db.kasb.or.kr/api";

#[derive(Clone, Debug, Default)]
struct RouteTransport {
    routes: Arc<HashMap<String, Value>>,
    calls: Arc<Mutex<Vec<String>>>,
}

impl RouteTransport {
    fn new(routes: impl IntoIterator<Item = (String, Value)>) -> Self {
        Self {
            routes: Arc::new(routes.into_iter().collect()),
            calls: Arc::default(),
        }
    }

    fn calls(&self) -> Vec<String> {
        self.calls
            .lock()
            .expect("call log lock should work")
            .clone()
    }
}

impl HttpTransport for RouteTransport {
    #[allow(clippy::manual_async_fn)]
    fn get<'a>(
        &'a self,
        url: &'a str,
        _cancellation: &'a CancellationToken,
    ) -> impl Future<Output = Result<HttpResponse, TransportError>> + Send + 'a {
        let body = self.routes.get(url).cloned();
        self.calls
            .lock()
            .expect("call log lock should work")
            .push(url.to_owned());
        async move {
            match body {
                Some(body) => Ok(HttpResponse {
                    status: 200,
                    body: serde_json::to_vec(&body).expect("route body should serialize"),
                }),
                None => Err(TransportError::Unavailable(format!(
                    "no fixture route for {url}"
                ))),
            }
        }
    }
}

fn paragraph_url(para_num: &str) -> String {
    format!("{BASE}/paragraphs/content/1102/{para_num}")
}

fn section_url(index_document_id: &str) -> String {
    format!("{BASE}/paragraphs/1102/{index_document_id}")
}

fn structure_url() -> String {
    format!("{BASE}/standard-indexes/1102")
}

fn paragraph_row(para_num: &str, index_document_id: &str) -> Value {
    json!({"paraContents": [{
        "stdNum": 1102,
        "paraNum": para_num,
        "uniqueKey": format!("1102-{para_num}"),
        "documentId": index_document_id,
        "paraContent": format!("<p>{para_num}</p>"),
        "fullContent": para_num
    }]})
}

fn section(title: &str, para_nums: &[&str]) -> Value {
    let mut clauses = vec![json!({"title": title})];
    clauses.extend(para_nums.iter().map(|para_num| {
        json!({
            "stdNum": 1102,
            "paraNum": para_num,
            "uniqueKey": format!("1102-{para_num}"),
            "paraContent": format!("<p>{para_num}</p>"),
            "fullContent": para_num
        })
    }));
    json!({"clauses": clauses, "mainTitle": title})
}

fn structure(rows: &[(&str, u8, &str, &str)]) -> Value {
    let mut indexes = vec![json!({
        "documentId": "root",
        "stdNum": 1102,
        "level": 1,
        "title": "기업회계기준서 제1102호 주식기준보상",
        "ref": ""
    })];
    indexes.extend(rows.iter().map(|(id, level, title, reference)| {
        json!({
            "documentId": id,
            "stdNum": 1102,
            "level": level,
            "title": title,
            "ref": reference
        })
    }));
    json!({"standardIndexes": indexes})
}

/// The two adjacent sections from issue #28, preceded by an earlier section.
fn issue_routes() -> Vec<(String, Value)> {
    vec![
        (
            structure_url(),
            structure(&[
                ("early", 2, "앞선 결론", "BC330~BC338"),
                ("first", 2, "결론 근거 A", "BC339~BC345"),
                ("second", 2, "결론 근거 B", "BC346"),
            ]),
        ),
        (
            section_url("early"),
            section("앞선 결론", &["BC330", "BC338"]),
        ),
        (
            section_url("first"),
            section("결론 근거 A", &["BC339", "BC340", "BC345"]),
        ),
        (section_url("second"), section("결론 근거 B", &["BC346"])),
        (paragraph_url("BC338"), paragraph_row("BC338", "early")),
        (paragraph_url("BC339"), paragraph_row("BC339", "first")),
        (paragraph_url("BC340"), paragraph_row("BC340", "first")),
        (paragraph_url("BC346"), paragraph_row("BC346", "second")),
    ]
}

async fn run(
    transport: &RouteTransport,
    input: Value,
) -> Result<GetParagraphRangeResult, KasbError> {
    KasbClient::from_parts(transport.clone(), FixedClock::new(FIXED_TIME))
        .execute_get_paragraph_range(input, &CancellationToken::new())
        .await
}

fn failure(result: Result<GetParagraphRangeResult, KasbError>) -> KasbFailure {
    match result.expect_err("range should fail") {
        KasbError::Failure(failure) => failure,
        KasbError::Cancelled => panic!("expected a capability failure"),
    }
}

fn para_nums(result: &GetParagraphRangeResult) -> Vec<&str> {
    result
        .result
        .clauses
        .iter()
        .filter_map(|clause| clause.para_num.as_deref())
        .collect()
}

#[tokio::test]
async fn combines_a_range_across_adjacent_indexed_sections_in_source_order() {
    let transport = RouteTransport::new(issue_routes());
    let result = run(
        &transport,
        json!({"stdNum": "1102", "from": "BC340", "to": "BC346"}),
    )
    .await
    .expect("cross-section range should resolve");

    assert_eq!(para_nums(&result), ["BC340", "BC345", "BC346"]);
    let titles: Vec<_> = result
        .result
        .clauses
        .iter()
        .filter_map(|clause| clause.title.as_deref())
        .collect();
    assert_eq!(titles, ["결론 근거 B"]);
    assert_eq!(result.references.index_document_ids, ["first", "second"]);
    assert_eq!(
        result.result.sections[0].r#ref.as_deref(),
        Some("BC339~BC345")
    );
    assert_eq!(result.result.sections[1].section_url, section_url("second"));
    assert_eq!(result.metadata.source.endpoint, structure_url());
    assert_eq!(
        result.references.standard_title.as_deref(),
        Some("기업회계기준서 제1102호 주식기준보상")
    );
    assert!(result.warnings.is_empty());
    assert_eq!(
        transport.calls(),
        [
            paragraph_url("BC340"),
            paragraph_url("BC346"),
            structure_url(),
            section_url("first"),
            section_url("second"),
        ]
    );
}

#[tokio::test]
async fn ancestor_sections_between_boundaries_do_not_duplicate_paragraphs() {
    let mut routes = issue_routes();
    routes.retain(|(url, _)| url != &structure_url());
    routes.push((
        structure_url(),
        structure(&[
            ("early", 2, "앞선 결론", "BC330~BC338"),
            ("parent", 2, "결론 근거", "BC339~BC346"),
            ("first", 3, "결론 근거 A", "BC339~BC345"),
            ("second", 3, "결론 근거 B", "BC346"),
        ]),
    ));
    // The ancestor's response repeats its children's paragraphs.
    routes.push((
        section_url("parent"),
        section("결론 근거", &["BC339", "BC340", "BC345", "BC346"]),
    ));
    let transport = RouteTransport::new(routes);
    let result = run(
        &transport,
        json!({"stdNum": "1102", "from": "BC338", "to": "BC346"}),
    )
    .await
    .expect("range through an ancestor should resolve");

    assert_eq!(
        para_nums(&result),
        ["BC338", "BC339", "BC340", "BC345", "BC346"]
    );
    // The ancestor already completes the range, so its children are not fetched.
    assert_eq!(result.references.index_document_ids, ["early", "parent"]);
}

#[tokio::test]
async fn dropped_structure_rows_mark_the_range_partial() {
    let mut routes = issue_routes();
    routes.retain(|(url, _)| url != &structure_url());
    let mut indexes = structure(&[
        ("first", 2, "결론 근거 A", "BC339~BC345"),
        ("second", 2, "결론 근거 B", "BC346"),
    ]);
    indexes["standardIndexes"]
        .as_array_mut()
        .expect("indexes should be an array")
        .insert(
            2,
            json!({"documentId": "untitled", "stdNum": 1102, "ref": "BC345A"}),
        );
    routes.push((structure_url(), indexes));
    let result = run(
        &RouteTransport::new(routes),
        json!({"stdNum": "1102", "from": "BC339", "to": "BC346"}),
    )
    .await
    .expect("a dropped structure row should not fail the range");

    assert_eq!(
        result.warnings[0].code,
        ParagraphRangeWarningCode::SourceMetadataIncomplete
    );
    assert_eq!(
        serde_json::to_value(result.metadata.completeness).expect("completeness serializes"),
        json!("partial")
    );
}

#[tokio::test]
async fn single_paragraph_range_needs_one_boundary_lookup() {
    let transport = RouteTransport::new(issue_routes());
    let result = run(
        &transport,
        json!({"stdNum": "1102", "from": "BC346", "to": "BC346"}),
    )
    .await
    .expect("single-paragraph range should resolve");

    assert_eq!(para_nums(&result), ["BC346"]);
    assert_eq!(
        transport.calls(),
        [
            paragraph_url("BC346"),
            structure_url(),
            section_url("second")
        ]
    );
}

#[tokio::test]
async fn reversed_ranges_are_invalid_across_and_within_sections() {
    for (from, to, fetches_sections) in [("BC346", "BC339", false), ("BC340", "BC339", true)] {
        let transport = RouteTransport::new(issue_routes());
        let error = failure(
            run(
                &transport,
                json!({"stdNum": "1102", "from": from, "to": to}),
            )
            .await,
        );
        assert_eq!(error.code, KasbFailureCode::InvalidInput);
        assert_eq!(error.parameter.as_deref(), Some("to"));
        assert!(error.message.contains("swap \"from\" and \"to\""));
        assert_eq!(
            transport.calls().contains(&section_url("first")),
            fetches_sections
        );
    }
}

#[tokio::test]
async fn ranges_over_the_section_cap_are_rejected_before_section_fetches() {
    let ids: Vec<String> = (0..21).map(|index| format!("s{index}")).collect();
    let rows: Vec<(&str, u8, &str, &str)> =
        ids.iter().map(|id| (id.as_str(), 2, "절", "")).collect();
    let transport = RouteTransport::new([
        (structure_url(), structure(&rows)),
        (paragraph_url("1"), paragraph_row("1", "s0")),
        (paragraph_url("99"), paragraph_row("99", "s20")),
    ]);
    let error = failure(
        run(
            &transport,
            json!({"stdNum": "1102", "from": "1", "to": "99"}),
        )
        .await,
    );

    assert_eq!(error.code, KasbFailureCode::InvalidInput);
    assert_eq!(error.parameter.as_deref(), Some("to"));
    assert!(error.message.contains("spans 21 indexed sections"));
    assert_eq!(
        transport.calls(),
        [paragraph_url("1"), paragraph_url("99"), structure_url()]
    );
}

#[tokio::test]
async fn mixed_namespaces_never_reach_the_source() {
    let transport = RouteTransport::default();
    let error = failure(
        run(
            &transport,
            json!({"stdNum": "1102", "from": "60", "to": "B3"}),
        )
        .await,
    );
    assert_eq!(error.code, KasbFailureCode::InvalidInput);
    assert_eq!(error.parameter.as_deref(), Some("to"));
    assert!(transport.calls().is_empty());
}

#[tokio::test]
async fn source_disagreement_is_source_changed_and_missing_boundaries_are_not_found() {
    let mut routes = issue_routes();
    routes.retain(|(url, _)| url != &paragraph_url("BC346"));
    routes.push((paragraph_url("BC346"), paragraph_row("BC346", "unlisted")));
    let error = failure(
        run(
            &RouteTransport::new(routes),
            json!({"stdNum": "1102", "from": "BC339", "to": "BC346"}),
        )
        .await,
    );
    assert_eq!(error.code, KasbFailureCode::SourceChanged);
    assert!(error.message.contains("does not list"));

    let mut routes = issue_routes();
    routes.retain(|(url, _)| url != &section_url("second"));
    routes.push((section_url("second"), section("결론 근거 B", &[])));
    let error = failure(
        run(
            &RouteTransport::new(routes),
            json!({"stdNum": "1102", "from": "BC339", "to": "BC346"}),
        )
        .await,
    );
    assert_eq!(error.code, KasbFailureCode::SourceChanged);
    assert!(error.message.contains("does not contain paragraph BC346"));

    let mut routes = issue_routes();
    routes.push((paragraph_url("BC999"), json!({"paraContents": []})));
    let error = failure(
        run(
            &RouteTransport::new(routes),
            json!({"stdNum": "1102", "from": "BC339", "to": "BC999"}),
        )
        .await,
    );
    assert_eq!(error.code, KasbFailureCode::NotFound);
}

#[tokio::test]
async fn omitted_section_rows_mark_the_range_partial() {
    let mut routes = issue_routes();
    routes.retain(|(url, _)| url != &section_url("second"));
    let mut partial = section("결론 근거 B", &["BC346"]);
    partial["clauses"]
        .as_array_mut()
        .expect("clauses should be an array")
        .push(json!("not a row"));
    routes.push((section_url("second"), partial));
    let result = run(
        &RouteTransport::new(routes),
        json!({"stdNum": "1102", "from": "BC339", "to": "BC346"}),
    )
    .await
    .expect("partial normalization should still succeed");

    assert_eq!(
        result.warnings[0].code,
        ParagraphRangeWarningCode::PartialClauseNormalization
    );
    assert_eq!(
        serde_json::to_value(result.metadata.completeness).expect("completeness serializes"),
        json!("partial")
    );
}
