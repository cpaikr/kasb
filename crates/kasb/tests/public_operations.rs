use std::collections::HashMap;
use std::future::{Future, pending};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use kasb::capabilities::get_section::{SectionClauseKind, SectionWarningCode};
use kasb::capabilities::search_qna::{PaginationStatus, SearchQnaRequest, SearchQnaWarningCode};
use kasb::capabilities::search_standards::{SearchStandardsRequest, SearchStandardsWarningCode};
use kasb::http::{CancellationToken, HttpResponse, HttpTransport, TransportError};
use kasb::{Clock, FixedClock, KasbClient, KasbError, KasbFailureCode};
use serde_json::{Value, json};

const FIXED_TIME: &str = "2026-05-18T00:00:00.000Z";

#[derive(Clone, Debug)]
enum Outcome {
    Response(HttpResponse),
    Error(TransportError),
    Pending,
}

#[derive(Clone, Debug, Default)]
struct FixtureTransport {
    routes: Arc<HashMap<String, Outcome>>,
    calls: Arc<Mutex<Vec<String>>>,
}

#[derive(Clone, Debug)]
struct CompletionClock {
    calls: Arc<Mutex<Vec<String>>>,
    expected_calls: usize,
}

#[derive(Clone, Debug)]
struct EnrichmentTrackingTransport {
    calls: Arc<AtomicUsize>,
    active: Arc<AtomicUsize>,
    max_active: Arc<AtomicUsize>,
    delay: Duration,
}

impl EnrichmentTrackingTransport {
    fn new(delay: Duration) -> Self {
        Self {
            calls: Arc::new(AtomicUsize::new(0)),
            active: Arc::new(AtomicUsize::new(0)),
            max_active: Arc::new(AtomicUsize::new(0)),
            delay,
        }
    }
}

impl HttpTransport for EnrichmentTrackingTransport {
    #[allow(clippy::manual_async_fn)]
    fn get<'a>(
        &'a self,
        url: &'a str,
        _cancellation: &'a CancellationToken,
    ) -> impl Future<Output = Result<HttpResponse, TransportError>> + Send + 'a {
        let url = url.to_owned();
        async move {
            self.calls.fetch_add(1, Ordering::AcqRel);
            if url.contains("/api/standard?searchWord=") {
                let rows = (1..=16)
                    .map(|index| json!({"key": index.to_string(), "doc_count": index}))
                    .collect::<Vec<_>>();
                return Ok(HttpResponse {
                    status: 200,
                    body: serde_json::to_vec(&json!({"standards": {"stdCountArr": rows}}))
                        .expect("fixture should serialize"),
                });
            }

            let active = self.active.fetch_add(1, Ordering::AcqRel) + 1;
            self.max_active.fetch_max(active, Ordering::AcqRel);
            tokio::time::sleep(self.delay).await;
            self.active.fetch_sub(1, Ordering::AcqRel);
            let std_num = url.rsplit('/').next().expect("structure URL has an id");
            Ok(HttpResponse {
                status: 200,
                body: serde_json::to_vec(&json!({"standardIndexes": [{
                    "documentId": format!("section-{std_num}"),
                    "stdNum": std_num,
                    "title": format!("title-{std_num}"),
                    "level": 1
                }]}))
                .expect("fixture should serialize"),
            })
        }
    }
}

impl Clock for CompletionClock {
    fn now_iso8601(&self) -> String {
        if self.calls.lock().expect("call log lock should work").len() == self.expected_calls {
            "2026-05-18T00:00:02.000Z".to_owned()
        } else {
            FIXED_TIME.to_owned()
        }
    }
}

impl FixtureTransport {
    fn new(routes: impl IntoIterator<Item = (String, Outcome)>) -> Self {
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

impl HttpTransport for FixtureTransport {
    #[allow(clippy::manual_async_fn)]
    fn get<'a>(
        &'a self,
        url: &'a str,
        _cancellation: &'a CancellationToken,
    ) -> impl Future<Output = Result<HttpResponse, TransportError>> + Send + 'a {
        let outcome = self.routes.get(url).cloned();
        self.calls
            .lock()
            .expect("call log lock should work")
            .push(url.to_owned());
        async move {
            match outcome {
                Some(Outcome::Response(value)) => Ok(value),
                Some(Outcome::Error(value)) => Err(value),
                Some(Outcome::Pending) => pending().await,
                None => Err(TransportError::Unavailable(format!(
                    "undeclared test route: {url}"
                ))),
            }
        }
    }
}

fn client(
    routes: impl IntoIterator<Item = (String, Outcome)>,
) -> (KasbClient<FixtureTransport, FixedClock>, FixtureTransport) {
    let transport = FixtureTransport::new(routes);
    (
        KasbClient::from_parts(transport.clone(), FixedClock::new(FIXED_TIME)),
        transport,
    )
}

fn response(status: u16, value: Value) -> Outcome {
    Outcome::Response(HttpResponse {
        status,
        body: serde_json::to_vec(&value).expect("fixture should serialize"),
    })
}

fn failure(error: KasbError) -> kasb::KasbFailure {
    match error {
        KasbError::Failure(value) => value,
        KasbError::Cancelled => panic!("expected typed failure"),
    }
}

#[tokio::test]
async fn invalid_requests_are_closed_and_never_reach_transport() {
    let (client, transport) = client([]);
    let cancellation = CancellationToken::new();
    let failures = [
        failure(
            client
                .execute_search_standards(json!({"keyword": ""}), &cancellation)
                .await
                .expect_err("blank keyword should fail"),
        ),
        failure(
            client
                .execute_get_standard_structure(json!({"stdNum": ""}), &cancellation)
                .await
                .expect_err("blank standard should fail"),
        ),
        failure(
            client
                .execute_get_section(json!({"stdNum": "1116"}), &cancellation)
                .await
                .expect_err("missing locator should fail"),
        ),
        failure(
            client
                .execute_search_qna(
                    json!({"keyword": "리스", "from": "2024-02-30"}),
                    &cancellation,
                )
                .await
                .expect_err("invalid date should fail"),
        ),
        failure(
            client
                .execute_get_qna(json!({"docNumber": "35629"}), &cancellation)
                .await
                .expect_err("numeric qna id should fail"),
        ),
    ];
    assert!(
        failures
            .iter()
            .all(|value| value.code == KasbFailureCode::InvalidInput && !value.retryable)
    );
    assert!(transport.calls().is_empty());
}

#[tokio::test]
async fn cancellation_is_execution_control_for_every_new_primary_operation() {
    let operations = [
        (
            "https://db.kasb.or.kr/api/standard?searchWord=x",
            "search-standards",
            json!({"keyword": "x"}),
        ),
        (
            "https://db.kasb.or.kr/api/standard-indexes/1116",
            "get-standard-structure",
            json!({"stdNum": "1116"}),
        ),
        (
            "https://db.kasb.or.kr/api/paragraphs/1116/section",
            "get-section",
            json!({"stdNum": "1116", "indexDocumentId": "section"}),
        ),
        (
            "https://db.kasb.or.kr/api/qnas/v2?types=11%2C12%2C13%2C14%2C15%2C24%2C25&searchWord=x&page=1&rows=10",
            "search-qna",
            json!({"keyword": "x"}),
        ),
        (
            "https://db.kasb.or.kr/api/qnas/v2/SSI-x",
            "get-qna",
            json!({"docNumber": "SSI-x"}),
        ),
    ];
    for (url, operation, input) in operations {
        let (client, transport) = client([(url.to_owned(), Outcome::Pending)]);
        let cancellation = CancellationToken::new();
        let cancel = cancellation.clone();
        let task = tokio::spawn(async move {
            match operation {
                "search-standards" => client
                    .execute_search_standards(input, &cancellation)
                    .await
                    .map(|_| ()),
                "get-standard-structure" => client
                    .execute_get_standard_structure(input, &cancellation)
                    .await
                    .map(|_| ()),
                "get-section" => client
                    .execute_get_section(input, &cancellation)
                    .await
                    .map(|_| ()),
                "search-qna" => client
                    .execute_search_qna(input, &cancellation)
                    .await
                    .map(|_| ()),
                "get-qna" => client
                    .execute_get_qna(input, &cancellation)
                    .await
                    .map(|_| ()),
                _ => unreachable!(),
            }
        });
        while transport.calls().is_empty() {
            tokio::task::yield_now().await;
        }
        cancel.cancel();
        assert_eq!(
            task.await.expect("task should join"),
            Err(KasbError::Cancelled)
        );
        assert_eq!(transport.calls(), [url]);
    }
}

#[tokio::test]
async fn shared_transport_policy_applies_without_retries() {
    let url = "https://db.kasb.or.kr/api/qnas/v2/SSI-x";
    for (outcome, code, retryable) in [
        (
            response(400, json!({})),
            KasbFailureCode::SourceUnavailable,
            false,
        ),
        (response(404, json!({})), KasbFailureCode::NotFound, false),
        (
            response(429, json!({})),
            KasbFailureCode::SourceUnavailable,
            true,
        ),
        (
            response(503, json!({})),
            KasbFailureCode::SourceUnavailable,
            true,
        ),
        (
            Outcome::Error(TransportError::Timeout),
            KasbFailureCode::SourceUnavailable,
            true,
        ),
        (
            Outcome::Error(TransportError::ResponseTooLarge {
                limit: kasb::http::MAX_RESPONSE_BYTES,
            }),
            KasbFailureCode::SourceChanged,
            false,
        ),
    ] {
        let (client, transport) = client([(url.to_owned(), outcome)]);
        let value = failure(
            client
                .execute_get_qna(json!({"docNumber": "SSI-x"}), &CancellationToken::new())
                .await
                .expect_err("transport outcome should fail"),
        );
        assert_eq!(
            (value.code, value.retryable, value.source_url.as_deref()),
            (code, retryable, Some(url))
        );
        assert_eq!(transport.calls(), [url]);
    }

    let oversized = Outcome::Response(HttpResponse {
        status: 200,
        body: vec![b' '; kasb::http::MAX_RESPONSE_BYTES + 1],
    });
    let (client, transport) = client([(url.to_owned(), oversized)]);
    let value = failure(
        client
            .execute_get_qna(json!({"docNumber": "SSI-x"}), &CancellationToken::new())
            .await
            .expect_err("custom transports must share the response bound"),
    );
    assert_eq!(
        (value.code, value.retryable, value.source_url.as_deref()),
        (KasbFailureCode::SourceChanged, false, Some(url))
    );
    assert_eq!(transport.calls(), [url]);
}

#[tokio::test]
async fn partial_standard_rows_are_omitted_and_best_effort_enrichment_is_nonfatal() {
    let search_url = "https://db.kasb.or.kr/api/standard?searchWord=x";
    let (client, transport) = client([(
        search_url.to_owned(),
        response(
            200,
            json!({"standards": {"stdCountArr": [{"key": "1116", "doc_count": 3}, {}], "totalCount": 3}}),
        ),
    )]);
    let result = client
        .execute_search_standards(
            json!({"keyword": "x", "sort": "match-count"}),
            &CancellationToken::new(),
        )
        .await
        .expect("partial search should succeed");
    assert_eq!(result.result.standards.len(), 1);
    assert_eq!(
        result.metadata.completeness,
        kasb::capabilities::Completeness::Partial
    );
    assert_eq!(
        result.warnings[0].code,
        SearchStandardsWarningCode::SourceMetadataIncomplete
    );
    assert_eq!(
        transport.calls(),
        [
            search_url,
            "https://db.kasb.or.kr/api/standard-indexes/1116"
        ]
    );
}

#[tokio::test]
async fn ref_resolution_uses_deepest_then_stable_source_order() {
    let structure_url = "https://db.kasb.or.kr/api/standard-indexes/1116";
    let selected_url = "https://db.kasb.or.kr/api/paragraphs/1116/first";
    let structure = json!({"standardIndexes": [
        {"documentId": "root", "stdNum": "1116", "title": "기업회계기준서 제1116호 리스", "ref": "", "level": 1},
        {"documentId": "first", "stdNum": "1116", "title": "first", "ref": "1 ~ 2", "level": 3, "sort": 20},
        {"documentId": "second", "stdNum": "1116", "title": "second", "ref": "1~2", "level": 3, "sort": 1}
    ]});
    let (client, transport) = client([
        (structure_url.to_owned(), response(200, structure)),
        (
            selected_url.to_owned(),
            response(200, json!({"clauses": [], "mainTitle": "first"})),
        ),
    ]);
    let result = client
        .execute_get_section(
            json!({"stdNum": "1116", "ref": "1~2"}),
            &CancellationToken::new(),
        )
        .await
        .expect("ambiguous ref should resolve");
    assert_eq!(result.result.section.index_document_id, "first");
    assert_eq!(
        result
            .warnings
            .iter()
            .map(|value| value.code)
            .collect::<Vec<_>>(),
        [
            SectionWarningCode::AmbiguousRefResolved,
            SectionWarningCode::EmptySection
        ]
    );
    assert_eq!(transport.calls(), [structure_url, selected_url]);
}

#[tokio::test]
async fn recency_search_is_bounded_to_five_hundred_source_rows() {
    let mut routes = Vec::new();
    for page in 1..=10 {
        let url = format!(
            "https://db.kasb.or.kr/api/qnas/v2?types=11%2C12%2C13%2C14%2C15%2C24%2C25&searchWord=x&page={page}&rows=50"
        );
        routes.push((
            url,
            response(
                200,
                json!({"facilityQnas": [], "facilityQnaCountData": {"15": 600}}),
            ),
        ));
    }
    let (client, transport) = client(routes);
    let result = client
        .execute_search_qna(
            json!({"keyword": "x", "sortDate": "desc"}),
            &CancellationToken::new(),
        )
        .await
        .expect("bounded scan should succeed");
    assert_eq!(result.result.pagination_status, PaginationStatus::Estimated);
    assert_eq!(transport.calls().len(), 10);
    assert!(result.warnings.iter().any(|value| value.code
        == SearchQnaWarningCode::SourceMetadataIncomplete
        && value.message.contains("first 500 rows out of 600")));
}

#[tokio::test]
async fn qna_detail_identity_mismatch_is_source_drift() {
    let url = "https://db.kasb.or.kr/api/qnas/v2/SSI-x";
    let (client, _) = client([(
        url.to_owned(),
        response(
            200,
            json!({"facilityQna": {"docNumber": "SSI-y", "type": 15, "fullContent": "body"}}),
        ),
    )]);
    let value = failure(
        client
            .execute_get_qna(json!({"docNumber": "SSI-x"}), &CancellationToken::new())
            .await
            .expect_err("identity mismatch should fail"),
    );
    assert_eq!(
        (value.code, value.retryable, value.source_url.as_deref()),
        (KasbFailureCode::SourceChanged, false, Some(url))
    );
}

#[tokio::test]
async fn required_envelopes_rows_and_identities_fail_closed() {
    let cancellation = CancellationToken::new();

    let search_url = "https://db.kasb.or.kr/api/standard?searchWord=x";
    let (sdk, _) = client([(
        search_url.to_owned(),
        response(200, json!({"standards": {"stdCountArr": [{}]}})),
    )]);
    let value = failure(
        sdk.execute_search_standards(json!({"keyword": "x"}), &cancellation)
            .await
            .expect_err("all-invalid search rows should fail"),
    );
    assert_eq!(value.code, KasbFailureCode::SourceChanged);

    let structure_url = "https://db.kasb.or.kr/api/standard-indexes/1116";
    let (sdk, _) = client([(
        structure_url.to_owned(),
        response(
            200,
            json!({"standardIndexes": [{"documentId": "x", "stdNum": "9999", "title": "bad", "level": 1}]}),
        ),
    )]);
    let value = failure(
        sdk.execute_get_standard_structure(json!({"stdNum": "1116"}), &cancellation)
            .await
            .expect_err("structure identity mismatch should fail"),
    );
    assert_eq!(
        value.message,
        "Standard structure row stdNum does not match the request."
    );

    let filtered_url = "https://db.kasb.or.kr/api/standard-indexes/1116/searchWord?searchWord=x";
    let (sdk, _) = client([
        (
            structure_url.to_owned(),
            response(
                200,
                json!({"standardIndexes": [{"documentId": "x", "stdNum": "1116", "title": "title", "level": 1}]}),
            ),
        ),
        (
            filtered_url.to_owned(),
            response(200, json!({"searchedIndexCountMap": {"x": 1}})),
        ),
    ]);
    let value = failure(
        sdk.execute_get_standard_structure(
            json!({"stdNum": "1116", "keyword": "x"}),
            &cancellation,
        )
        .await
        .expect_err("OpenAPI-required filtered member should fail closed"),
    );
    assert_eq!(value.message, "Could not find searchedUniqueKeys array.");

    let section_url = "https://db.kasb.or.kr/api/paragraphs/1116/x";
    let (sdk, _) = client([(
        section_url.to_owned(),
        response(
            200,
            json!({"clauses": [{"stdNum": "9999", "paraNum": "1"}]}),
        ),
    )]);
    let value = failure(
        sdk.execute_get_section(
            json!({"stdNum": "1116", "indexDocumentId": "x"}),
            &cancellation,
        )
        .await
        .expect_err("clause identity mismatch should fail"),
    );
    assert_eq!(
        value.message,
        "Section paragraph row stdNum does not match the request."
    );

    let qna_search_url = "https://db.kasb.or.kr/api/qnas/v2?types=11%2C12%2C13%2C14%2C15%2C24%2C25&searchWord=x&page=1&rows=10";
    let (sdk, _) = client([(
        qna_search_url.to_owned(),
        response(200, json!({"facilityQnas": [{}]})),
    )]);
    let value = failure(
        sdk.execute_search_qna(json!({"keyword": "x"}), &cancellation)
            .await
            .expect_err("all-invalid Q&A rows should fail"),
    );
    assert_eq!(value.message, "Q&A search result fields changed.");

    let qna_url = "https://db.kasb.or.kr/api/qnas/v2/SSI-x";
    let (sdk, _) = client([(
        qna_url.to_owned(),
        response(
            200,
            json!({"facilityQna": {"docNumber": "SSI-x", "type": 15}}),
        ),
    )]);
    let value = failure(
        sdk.execute_get_qna(json!({"docNumber": "SSI-x"}), &cancellation)
            .await
            .expect_err("missing detail content should fail"),
    );
    assert_eq!(value.message, "Required Q&A response fields changed.");
}

#[tokio::test]
async fn source_derived_url_dot_segments_fail_closed_before_follow_up_requests() {
    let cancellation = CancellationToken::new();

    let standard_search_url = "https://db.kasb.or.kr/api/standard?searchWord=x";
    let (sdk, transport) = client([(
        standard_search_url.to_owned(),
        response(
            200,
            json!({"standards": {"stdCountArr": [{"key": "..", "doc_count": 1}]}}),
        ),
    )]);
    let value = failure(
        sdk.execute_search_standards(json!({"keyword": "x"}), &cancellation)
            .await
            .expect_err("dot-segment standard id should fail closed"),
    );
    assert_eq!(value.code, KasbFailureCode::SourceChanged);
    assert_eq!(transport.calls(), [standard_search_url]);

    let structure_url = "https://db.kasb.or.kr/api/standard-indexes/1116";
    let (sdk, transport) = client([(
        structure_url.to_owned(),
        response(
            200,
            json!({"standardIndexes": [{"documentId": ".", "stdNum": "1116", "title": "bad", "level": 1}]}),
        ),
    )]);
    let value = failure(
        sdk.execute_get_standard_structure(json!({"stdNum": "1116"}), &cancellation)
            .await
            .expect_err("dot-segment structure id should fail closed"),
    );
    assert_eq!(value.code, KasbFailureCode::SourceChanged);
    assert_eq!(transport.calls(), [structure_url]);

    let section_url = "https://db.kasb.or.kr/api/paragraphs/1116/x";
    let (sdk, transport) = client([(
        section_url.to_owned(),
        response(
            200,
            json!({"clauses": [{"stdNum": "1116", "documentId": "..", "paraNum": "1"}]}),
        ),
    )]);
    let value = failure(
        sdk.execute_get_section(
            json!({"stdNum": "1116", "indexDocumentId": "x"}),
            &cancellation,
        )
        .await
        .expect_err("dot-segment clause id should fail closed"),
    );
    assert_eq!(value.code, KasbFailureCode::SourceChanged);
    assert_eq!(transport.calls(), [section_url]);

    let qna_search_url = "https://db.kasb.or.kr/api/qnas/v2?types=11%2C12%2C13%2C14%2C15%2C24%2C25&searchWord=x&page=1&rows=10";
    let (sdk, transport) = client([(
        qna_search_url.to_owned(),
        response(
            200,
            json!({"facilityQnas": [{"docNumber": "..", "type": 15}]}),
        ),
    )]);
    let value = failure(
        sdk.execute_search_qna(json!({"keyword": "x"}), &cancellation)
            .await
            .expect_err("dot-segment Q&A id should fail closed"),
    );
    assert_eq!(value.code, KasbFailureCode::SourceChanged);
    assert_eq!(transport.calls(), [qna_search_url]);
}

#[test]
fn request_validation_matches_json_integer_and_ecmascript_trim_semantics() {
    let standards = SearchStandardsRequest::from_json(json!({
        "keyword": "x",
        "limit": 1.0,
        "sort": "\u{feff}match-count\u{feff}"
    }))
    .expect("integer-valued JSON number and ECMAScript whitespace should be accepted");
    assert_eq!(standards.limit(), 1);
    assert_eq!(
        serde_json::to_value(standards).expect("request serializes")["sort"],
        "match-count"
    );

    let qna = SearchQnaRequest::new("x")
        .expect("request should build")
        .with_types("\u{feff}15 , 24\u{feff}")
        .expect("types should use ECMAScript trim")
        .with_date_range(Some("\u{feff}\u{feff}"), Some(" 2026-05-18 "))
        .expect("blank optional dates should be omitted");
    assert_eq!(qna.types(), Some("15,24"));
    assert_eq!(qna.from(), None);
    assert_eq!(qna.to(), Some("2026-05-18"));
}

#[tokio::test]
async fn relevance_ranking_uses_nfkc_compatible_title_matching() {
    let search_url = "https://db.kasb.or.kr/api/standard?searchWord=ABC";
    let (sdk, _) = client([
        (
            search_url.to_owned(),
            response(
                200,
                json!({"standards": {"stdCountArr": [
                    {"key": "1", "doc_count": 1},
                    {"key": "2", "doc_count": 99}
                ]}}),
            ),
        ),
        (
            "https://db.kasb.or.kr/api/standard-indexes/1".to_owned(),
            response(
                200,
                json!({"standardIndexes": [
                    {"documentId": "one", "stdNum": "1", "title": "ａｂｃ", "level": 1}
                ]}),
            ),
        ),
        (
            "https://db.kasb.or.kr/api/standard-indexes/2".to_owned(),
            response(
                200,
                json!({"standardIndexes": [
                    {"documentId": "two", "stdNum": "2", "title": "ABC 기타", "level": 1}
                ]}),
            ),
        ),
    ]);
    let result = sdk
        .execute_search_standards(
            json!({"keyword": "ABC", "limit": 2}),
            &CancellationToken::new(),
        )
        .await
        .expect("compatibility-equivalent title should rank first");
    assert_eq!(
        result
            .result
            .standards
            .iter()
            .map(|item| item.std_num.as_str())
            .collect::<Vec<_>>(),
        ["1", "2"]
    );
}

#[tokio::test]
async fn standard_kind_uses_ecmascript_whitespace_semantics() {
    let search_url = "https://db.kasb.or.kr/api/standard?searchWord=x";
    let structure_url = "https://db.kasb.or.kr/api/standard-indexes/2";
    let (sdk, _) = client([
        (
            search_url.to_owned(),
            response(
                200,
                json!({"standards": {"stdCountArr": [{"key": "2", "doc_count": 1}]}}),
            ),
        ),
        (
            structure_url.to_owned(),
            response(
                200,
                json!({"standardIndexes": [{
                    "documentId": "chapter",
                    "stdNum": "2",
                    "title": "제2장\u{0085}재무제표",
                    "level": 1
                }]}),
            ),
        ),
    ]);
    let result = sdk
        .execute_search_standards(
            json!({"keyword": "x", "sort": "match-count"}),
            &CancellationToken::new(),
        )
        .await
        .expect("standard search should succeed");
    assert_eq!(
        result.result.standards[0].standard_kind.as_deref(),
        Some("standard")
    );
}

#[tokio::test]
async fn qna_search_preserves_string_shapes_fallbacks_and_distinct_type_counts() {
    let url = "https://db.kasb.or.kr/api/qnas/v2?types=15%2C15&searchWord=x&page=1&rows=10";
    let (sdk, _) = client([(
        url.to_owned(),
        response(
            200,
            json!({
                "facilityQnas": [{
                    "docNumber": "SSI-x",
                    "type": 15,
                    "title": [],
                    "fullContent": "\u{0085}Body text\u{0085}",
                    "tags": " alpha,\u{feff}beta "
                }],
                "facilityQnaCountData": {"15": 2}
            }),
        ),
    )]);
    let result = sdk
        .execute_search_qna(
            json!({"keyword": "x", "types": "15,15"}),
            &CancellationToken::new(),
        )
        .await
        .expect("OpenAPI string alternatives should normalize");
    let item = &result.result.items[0];
    assert_eq!(item.title, "SSI-x");
    assert_eq!(item.snippet, "\u{0085}Body text\u{0085}");
    assert_eq!(item.tags, ["alpha", "beta"]);
    assert_eq!(result.result.total_count, 2);
}

#[tokio::test]
async fn qna_detail_preserves_non_ecmascript_unicode_whitespace() {
    let url = "https://db.kasb.or.kr/api/qnas/v2/SSI-x";
    let (sdk, _) = client([(
        url.to_owned(),
        response(
            200,
            json!({"facilityQna": {
                "docNumber": "SSI-x",
                "type": 15,
                "fullContent": "\u{0085}Body\u{0085}",
                "tags": [" alpha ", "beta", "", 7]
            }}),
        ),
    )]);
    let result = sdk
        .execute_get_qna(json!({"docNumber": "SSI-x"}), &CancellationToken::new())
        .await
        .expect("valid source text should normalize");
    assert_eq!(result.result.qna.full_content, "\u{0085}Body\u{0085}");
    assert_eq!(result.result.qna.tags, [" alpha ", "beta", "", "7"]);
}

#[tokio::test]
async fn qna_search_preserves_array_tag_values() {
    let url = "https://db.kasb.or.kr/api/qnas/v2?types=11%2C12%2C13%2C14%2C15%2C24%2C25&searchWord=tags&page=1&rows=10";
    let (sdk, _) = client([(
        url.to_owned(),
        response(
            200,
            json!({
                "facilityQnas": [{
                    "docNumber": "SSI-tags",
                    "type": 15,
                    "tags": [" alpha ", "beta", "", 7]
                }],
                "facilityQnaCountData": {"15": 1}
            }),
        ),
    )]);
    let result = sdk
        .execute_search_qna(json!({"keyword": "tags"}), &CancellationToken::new())
        .await
        .expect("array tag scalars should retain their source values");
    assert_eq!(result.result.items[0].tags, [" alpha ", "beta", "", "7"]);
}

#[tokio::test]
async fn section_clause_without_paragraph_or_title_is_unknown() {
    let section_url = "https://db.kasb.or.kr/api/paragraphs/1116/x";
    let structure_url = "https://db.kasb.or.kr/api/standard-indexes/1116";
    let (sdk, _) = client([
        (
            section_url.to_owned(),
            response(
                200,
                json!({"clauses": [
                    {"stdNum": "1116", "documentId": "x", "type": "extension"}
                ]}),
            ),
        ),
        (
            structure_url.to_owned(),
            response(
                200,
                json!({"standardIndexes": [
                    {"documentId": "x", "stdNum": "1116", "title": "section", "level": 2}
                ]}),
            ),
        ),
    ]);
    let result = sdk
        .execute_get_section(
            json!({"stdNum": "1116", "indexDocumentId": "x"}),
            &CancellationToken::new(),
        )
        .await
        .expect("extension clause should remain visible");
    assert_eq!(result.result.clauses[0].kind, SectionClauseKind::Unknown);
}

#[tokio::test]
async fn empty_section_propagates_the_single_structure_attempt_failure() {
    let section_url = "https://db.kasb.or.kr/api/paragraphs/1116/x";
    let structure_url = "https://db.kasb.or.kr/api/standard-indexes/1116";
    let (sdk, transport) = client([
        (
            section_url.to_owned(),
            response(200, json!({"clauses": []})),
        ),
        (structure_url.to_owned(), response(503, json!({}))),
    ]);
    let value = failure(
        sdk.execute_get_section(
            json!({"stdNum": "1116", "indexDocumentId": "x"}),
            &CancellationToken::new(),
        )
        .await
        .expect_err("existence cannot be confirmed after structure failure"),
    );
    assert_eq!(value.code, KasbFailureCode::SourceUnavailable);
    assert_eq!(transport.calls(), [section_url, structure_url]);
}

#[tokio::test]
async fn qna_timestamp_is_sampled_after_network_completion() {
    let url = "https://db.kasb.or.kr/api/qnas/v2?types=11%2C12%2C13%2C14%2C15%2C24%2C25&searchWord=x&page=1&rows=10";
    let transport = FixtureTransport::new([(
        url.to_owned(),
        response(200, json!({"facilityQnas": [], "facilityQnaCountData": {}})),
    )]);
    let sdk = KasbClient::from_parts(
        transport.clone(),
        CompletionClock {
            calls: Arc::clone(&transport.calls),
            expected_calls: 1,
        },
    );
    let result = sdk
        .execute_search_qna(json!({"keyword": "x"}), &CancellationToken::new())
        .await
        .expect("search should succeed");
    assert_eq!(result.metadata.fetched_at, "2026-05-18T00:00:02.000Z");
}

#[tokio::test]
async fn standard_ranking_enrichment_fails_closed_above_its_request_bound() {
    let url = "https://db.kasb.or.kr/api/standard?searchWord=x";
    let rows = (0..513)
        .map(|index| json!({"key": index.to_string(), "doc_count": 1}))
        .collect::<Vec<_>>();
    let (sdk, transport) = client([(
        url.to_owned(),
        response(200, json!({"standards": {"stdCountArr": rows}})),
    )]);
    let value = failure(
        sdk.execute_search_standards(json!({"keyword": "x"}), &CancellationToken::new())
            .await
            .expect_err("unbounded enrichment should fail closed"),
    );
    assert_eq!(value.code, KasbFailureCode::SourceChanged);
    assert!(value.message.contains("more than 512 rows"));
    assert_eq!(transport.calls(), [url]);
}

#[tokio::test]
async fn standard_ranking_enrichment_accepts_its_exact_request_bound() {
    let search_url = "https://db.kasb.or.kr/api/standard?searchWord=x";
    let rows = (0..512)
        .map(|index| json!({"key": index.to_string(), "doc_count": 1}))
        .collect::<Vec<_>>();
    let mut routes = vec![(
        search_url.to_owned(),
        response(200, json!({"standards": {"stdCountArr": rows}})),
    )];
    routes.extend((0..512).map(|index| {
        (
            format!("https://db.kasb.or.kr/api/standard-indexes/{index}"),
            response(200, json!({"standardIndexes": []})),
        )
    }));
    let (sdk, transport) = client(routes);
    let result = sdk
        .execute_search_standards(
            json!({"keyword": "x", "limit": 1}),
            &CancellationToken::new(),
        )
        .await
        .expect("the exact enrichment bound should remain supported");
    assert_eq!(result.result.returned_count, 1);
    assert_eq!(result.result.total_standard_count, 512);
    assert_eq!(transport.calls().len(), 513);
}

#[tokio::test]
async fn standard_enrichment_is_concurrent_bounded_and_cancellable() {
    let transport = EnrichmentTrackingTransport::new(Duration::from_millis(20));
    let sdk = KasbClient::from_parts(transport.clone(), FixedClock::new(FIXED_TIME));
    let result = sdk
        .execute_search_standards(
            json!({"keyword": "x", "limit": 16, "sort": "title"}),
            &CancellationToken::new(),
        )
        .await
        .expect("bounded fan-out should complete");
    assert_eq!(result.result.returned_count, 16);
    assert_eq!(transport.calls.load(Ordering::Acquire), 17);
    assert_eq!(transport.max_active.load(Ordering::Acquire), 8);

    let transport = EnrichmentTrackingTransport::new(Duration::from_secs(10));
    let sdk = KasbClient::from_parts(transport.clone(), FixedClock::new(FIXED_TIME));
    let cancellation = CancellationToken::new();
    let cancel = cancellation.clone();
    let task = tokio::spawn(async move {
        sdk.execute_search_standards(
            json!({"keyword": "x", "limit": 16, "sort": "title"}),
            &cancellation,
        )
        .await
    });
    while transport.calls.load(Ordering::Acquire) < 2 {
        tokio::task::yield_now().await;
    }
    cancel.cancel();
    assert_eq!(
        task.await.expect("task should join"),
        Err(KasbError::Cancelled)
    );
    assert!(transport.max_active.load(Ordering::Acquire) <= 8);
}
