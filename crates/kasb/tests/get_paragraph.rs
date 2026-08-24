use std::collections::HashMap;
use std::future::{Future, pending};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use kasb::capabilities::get_paragraph::{GetParagraphRequest, ParagraphWarningCode};
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
}

impl Clock for CompletionClock {
    fn now_iso8601(&self) -> String {
        if self.calls.lock().expect("call log lock should work").len() == 2 {
            "2026-05-18T00:00:02.000Z".to_owned()
        } else {
            "2026-05-18T00:00:00.000Z".to_owned()
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
                Some(Outcome::Response(response)) => Ok(response),
                Some(Outcome::Error(error)) => Err(error),
                Some(Outcome::Pending) => pending().await,
                None => Err(TransportError::Unavailable(format!(
                    "no fixture route for {url}"
                ))),
            }
        }
    }
}

fn repository_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn fixture_response(path: &str) -> Outcome {
    let body = std::fs::read(repository_root().join(path)).expect("fixture should be readable");
    Outcome::Response(HttpResponse { status: 200, body })
}

fn json_response(status: u16, body: Value) -> Outcome {
    Outcome::Response(HttpResponse {
        status,
        body: serde_json::to_vec(&body).expect("test response should serialize"),
    })
}

fn paragraph_url(para_num: &str) -> String {
    let encoded = match para_num {
        "한2.1" => "%ED%95%9C2.1",
        value => value,
    };
    format!("https://db.kasb.or.kr/api/paragraphs/content/1116/{encoded}")
}

fn structure_url() -> String {
    "https://db.kasb.or.kr/api/standard-indexes/1116".to_owned()
}

fn fixture_client(
    paragraph_fixture: &str,
    para_num: &str,
) -> (KasbClient<FixtureTransport, FixedClock>, FixtureTransport) {
    let transport = FixtureTransport::new([
        (paragraph_url(para_num), fixture_response(paragraph_fixture)),
        (
            structure_url(),
            fixture_response("fixtures/kasb/standard-indexes-1116.json"),
        ),
    ]);
    (
        KasbClient::from_parts(transport.clone(), FixedClock::new(FIXED_TIME)),
        transport,
    )
}

async fn execute(
    client: &KasbClient<FixtureTransport, FixedClock>,
    input: Value,
) -> Result<kasb::capabilities::get_paragraph::GetParagraphResult, KasbError> {
    client
        .execute_get_paragraph(input, &CancellationToken::new())
        .await
}

fn failure(error: KasbError) -> kasb::KasbFailure {
    match error {
        KasbError::Failure(failure) => failure,
        KasbError::Cancelled => panic!("expected a serialized capability failure"),
    }
}

#[tokio::test]
async fn retrieves_all_approved_paragraph_number_forms_from_shared_fixtures() {
    let cases = [
        ("23", "fixtures/kasb/paragraph-1116-23.json"),
        ("한2.1", "fixtures/kasb/paragraph-1116-han2.1.json"),
        ("B3", "fixtures/kasb/paragraph-1116-B3.json"),
        ("BC240A", "fixtures/kasb/paragraph-1116-BC240A.json"),
    ];

    for (para_num, fixture) in cases {
        let (client, transport) = fixture_client(fixture, para_num);
        let result = execute(&client, json!({"stdNum": "1116", "paraNum": para_num}))
            .await
            .expect("fixture paragraph should normalize");

        assert_eq!(result.result.paragraph.std_num, "1116");
        assert_eq!(result.result.paragraph.para_num, para_num);
        assert_eq!(
            result.result.paragraph.unique_key,
            format!("1116-{para_num}")
        );
        assert_eq!(
            result.result.paragraph.standard_title.as_deref(),
            Some("기업회계기준서 제1116호 리스")
        );
        assert_eq!(
            result.result.paragraph.standard_kind.as_deref(),
            Some("k-ifrs-standard")
        );
        assert!(!result.result.paragraph.para_content.is_empty());
        assert!(!result.result.paragraph.full_content.contains('<'));
        assert_eq!(result.metadata.fetched_at, FIXED_TIME);
        assert!(result.warnings.is_empty());
        assert_eq!(transport.calls().len(), 2);
    }
}

#[tokio::test]
async fn timestamps_the_result_after_primary_and_enrichment_work_complete() {
    let transport = FixtureTransport::new([
        (
            paragraph_url("23"),
            fixture_response("fixtures/kasb/paragraph-1116-23.json"),
        ),
        (
            structure_url(),
            fixture_response("fixtures/kasb/standard-indexes-1116.json"),
        ),
    ]);
    let client = KasbClient::from_parts(
        transport.clone(),
        CompletionClock {
            calls: Arc::clone(&transport.calls),
        },
    );

    let result = client
        .execute_get_paragraph(
            json!({"stdNum": "1116", "paraNum": "23"}),
            &CancellationToken::new(),
        )
        .await
        .expect("fixture paragraph should normalize");

    assert_eq!(result.metadata.fetched_at, "2026-05-18T00:00:02.000Z");
    assert_eq!(transport.calls().len(), 2);
}

#[tokio::test]
async fn normalization_separates_compound_basis_paragraph_list_markers() {
    let (client, _) = fixture_client("fixtures/kasb/paragraph-1116-BC240A.json", "BC240A");
    let result = execute(&client, json!({"stdNum": "1116", "paraNum": "BC240A"}))
        .await
        .expect("fixture paragraph should normalize");

    let text = result.result.paragraph.full_content;
    assert!(text.contains("\n(1) IFRS 16"));
    assert!(text.contains("\n(가) 금융리스"));
    assert!(text.contains("\n(4) IASB는"));
}

#[tokio::test]
async fn shared_get_paragraph_conformance_cases_match_committed_expectations() {
    let root = repository_root();
    let manifest: Value = serde_json::from_slice(
        &std::fs::read(root.join("conformance/v1/cases.json"))
            .expect("conformance manifest should be readable"),
    )
    .expect("conformance manifest should parse");
    let cases = manifest["cases"]
        .as_array()
        .expect("conformance cases should be an array");
    let paragraph_cases: Vec<_> = cases
        .iter()
        .filter(|case| case["operation"] == "get-paragraph")
        .collect();
    assert_eq!(paragraph_cases.len(), 4);

    for case in paragraph_cases {
        let routes = case["routes"]
            .as_array()
            .expect("routes should be an array")
            .iter()
            .map(|route| {
                (
                    route["requestUrl"]
                        .as_str()
                        .expect("route URL should be a string")
                        .to_owned(),
                    fixture_response(
                        route["fixture"]
                            .as_str()
                            .expect("fixture path should be a string"),
                    ),
                )
            });
        let transport = FixtureTransport::new(routes);
        let client = KasbClient::from_parts(transport, FixedClock::new(FIXED_TIME));
        let actual = match execute(&client, case["input"].clone()).await {
            Ok(result) => {
                let mut value = serde_json::to_value(result).expect("result should serialize");
                value["metadata"]["fetchedAt"] = json!("<normalized-fetched-at>");
                json!({"ok": true, "value": value})
            }
            Err(KasbError::Failure(error)) => json!({"ok": false, "error": error}),
            Err(KasbError::Cancelled) => panic!("shared cases do not represent cancellation"),
        };
        let expected: Value = serde_json::from_slice(
            &std::fs::read(
                root.join(
                    case["expected"]
                        .as_str()
                        .expect("expected path should be a string"),
                ),
            )
            .expect("expected result should be readable"),
        )
        .expect("expected result should parse");

        assert_eq!(actual, expected, "case {} diverged", case["id"]);
    }
}

#[tokio::test]
async fn invalid_input_is_typed_and_never_reaches_transport() {
    let transport = FixtureTransport::default();
    let client = KasbClient::from_parts(transport.clone(), FixedClock::new(FIXED_TIME));
    let error = failure(
        execute(&client, json!({"stdNum": "1116", "paraNum": "22~30"}))
            .await
            .expect_err("paragraph ranges should be rejected"),
    );

    assert_eq!(error.code, KasbFailureCode::InvalidInput);
    assert_eq!(error.parameter.as_deref(), Some("paraNum"));
    assert!(!error.retryable);
    assert!(transport.calls().is_empty());

    let error = GetParagraphRequest::new("1116", "22~30")
        .expect_err("the typed constructor must reject ranges");
    assert_eq!(error.code, KasbFailureCode::InvalidInput);
    assert_eq!(error.parameter.as_deref(), Some("paraNum"));
    assert!(transport.calls().is_empty());
}

#[tokio::test]
async fn empty_exact_lookup_is_not_found() {
    let url = paragraph_url("23");
    let transport =
        FixtureTransport::new([(url.clone(), json_response(200, json!({"paraContents": []})))]);
    let client = KasbClient::from_parts(transport.clone(), FixedClock::new(FIXED_TIME));
    let error = failure(
        execute(&client, json!({"stdNum": "1116", "paraNum": "23"}))
            .await
            .expect_err("an empty exact lookup should fail"),
    );

    assert_eq!(error.code, KasbFailureCode::NotFound);
    assert_eq!(error.source_url.as_deref(), Some(url.as_str()));
    assert!(!error.retryable);
    assert_eq!(transport.calls(), [url]);
}

#[tokio::test]
async fn multiple_rows_changed_fields_and_wrong_identity_are_source_drift() {
    let valid_row = json!({
        "stdNum": 1116,
        "paraNum": "23",
        "uniqueKey": "1116-23",
        "documentId": "bdbwhT",
        "paraContent": "<b>content</b>",
        "fullContent": "content"
    });
    let mut wrong_identity = valid_row.clone();
    wrong_identity["paraNum"] = json!("24");
    wrong_identity["uniqueKey"] = json!("1116-24");
    let cases = [
        json!({"paraContents": [valid_row.clone(), valid_row.clone()]}),
        json!({"paraContents": [{"stdNum": 1116}]}),
        json!({"paraContents": [{
            "stdNum": 1116,
            "paraNum": "23",
            "uniqueKey": "1116-23",
            "documentId": "",
            "paraContent": "content",
            "fullContent": "content"
        }]}),
        json!({"paraContents": [wrong_identity]}),
    ];

    for body in cases {
        let transport = FixtureTransport::new([(paragraph_url("23"), json_response(200, body))]);
        let client = KasbClient::from_parts(transport, FixedClock::new(FIXED_TIME));
        let error = failure(
            execute(&client, json!({"stdNum": "1116", "paraNum": "23"}))
                .await
                .expect_err("source drift should fail"),
        );
        assert_eq!(error.code, KasbFailureCode::SourceChanged);
        assert!(!error.retryable);
    }
}

#[tokio::test]
async fn transport_and_http_failures_have_exact_retry_policy_without_retries() {
    let cases = [
        (
            Outcome::Error(TransportError::Timeout),
            KasbFailureCode::SourceUnavailable,
            true,
        ),
        (
            Outcome::Error(TransportError::Unavailable("offline".to_owned())),
            KasbFailureCode::SourceUnavailable,
            true,
        ),
        (
            json_response(404, json!({})),
            KasbFailureCode::NotFound,
            false,
        ),
        (
            json_response(400, json!({})),
            KasbFailureCode::SourceUnavailable,
            false,
        ),
        (
            json_response(429, json!({})),
            KasbFailureCode::SourceUnavailable,
            true,
        ),
        (
            json_response(503, json!({})),
            KasbFailureCode::SourceUnavailable,
            true,
        ),
    ];

    for (outcome, code, retryable) in cases {
        let url = paragraph_url("23");
        let transport = FixtureTransport::new([(url.clone(), outcome)]);
        let client = KasbClient::from_parts(transport.clone(), FixedClock::new(FIXED_TIME));
        let error = failure(
            execute(&client, json!({"stdNum": "1116", "paraNum": "23"}))
                .await
                .expect_err("transport case should fail"),
        );
        assert_eq!(error.code, code);
        assert_eq!(error.retryable, retryable);
        assert_eq!(transport.calls(), [url]);
    }
}

#[tokio::test]
async fn non_json_success_is_source_drift() {
    let transport = FixtureTransport::new([(
        paragraph_url("23"),
        Outcome::Response(HttpResponse {
            status: 200,
            body: b"not json".to_vec(),
        }),
    )]);
    let client = KasbClient::from_parts(transport, FixedClock::new(FIXED_TIME));
    let error = failure(
        execute(&client, json!({"stdNum": "1116", "paraNum": "23"}))
            .await
            .expect_err("non-JSON success should fail"),
    );
    assert_eq!(error.code, KasbFailureCode::SourceChanged);
}

#[tokio::test]
async fn enrichment_failure_and_missing_parent_return_success_with_warning() {
    let cases = [
        Outcome::Error(TransportError::Timeout),
        json_response(
            200,
            json!({
                "standardIndexes": [{
                    "documentId": "different",
                    "stdNum": 1116,
                    "title": "기업회계기준서 제1116호 리스",
                    "level": 1
                }]
            }),
        ),
        json_response(200, json!({"standardIndexes": [{"documentId": "broken"}]})),
    ];

    for enrichment in cases {
        let transport = FixtureTransport::new([
            (
                paragraph_url("23"),
                fixture_response("fixtures/kasb/paragraph-1116-23.json"),
            ),
            (structure_url(), enrichment),
        ]);
        let client = KasbClient::from_parts(transport, FixedClock::new(FIXED_TIME));
        let result = execute(&client, json!({"stdNum": "1116", "paraNum": "23"}))
            .await
            .expect("metadata lookup failures should be best-effort");
        assert_eq!(result.warnings.len(), 1);
        assert_eq!(
            result.warnings[0].code,
            ParagraphWarningCode::ParagraphMetadataIncomplete
        );
    }
}

#[tokio::test]
async fn cancellation_interrupts_primary_and_enrichment_requests() {
    let primary_transport = FixtureTransport::new([(paragraph_url("23"), Outcome::Pending)]);
    let primary_client =
        KasbClient::from_parts(primary_transport.clone(), FixedClock::new(FIXED_TIME));
    cancel_pending(primary_client, &primary_transport, 1).await;
    assert_eq!(primary_transport.calls(), [paragraph_url("23")]);

    let enrichment_transport = FixtureTransport::new([
        (
            paragraph_url("23"),
            fixture_response("fixtures/kasb/paragraph-1116-23.json"),
        ),
        (structure_url(), Outcome::Pending),
    ]);
    let enrichment_client =
        KasbClient::from_parts(enrichment_transport.clone(), FixedClock::new(FIXED_TIME));
    cancel_pending(enrichment_client, &enrichment_transport, 2).await;
    assert_eq!(
        enrichment_transport.calls(),
        [paragraph_url("23"), structure_url()]
    );
}

#[tokio::test]
async fn an_already_cancelled_request_does_not_start_source_access() {
    let transport = FixtureTransport::new([(
        paragraph_url("23"),
        fixture_response("fixtures/kasb/paragraph-1116-23.json"),
    )]);
    let client = KasbClient::from_parts(transport.clone(), FixedClock::new(FIXED_TIME));
    let cancellation = CancellationToken::new();
    cancellation.cancel();
    let result = client
        .execute_get_paragraph(json!({"stdNum": "1116", "paraNum": "23"}), &cancellation)
        .await;

    assert!(matches!(result, Err(KasbError::Cancelled)));
    assert!(transport.calls().is_empty());
}

async fn cancel_pending(
    client: KasbClient<FixtureTransport, FixedClock>,
    transport: &FixtureTransport,
    expected_call_count: usize,
) {
    let cancellation = CancellationToken::new();
    let task_cancellation = cancellation.clone();
    let task = tokio::spawn(async move {
        client
            .execute_get_paragraph(
                json!({"stdNum": "1116", "paraNum": "23"}),
                &task_cancellation,
            )
            .await
    });
    tokio::time::timeout(Duration::from_secs(1), async {
        while transport.calls().len() < expected_call_count {
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("request should reach the pending source before cancellation");
    cancellation.cancel();
    let result = tokio::time::timeout(Duration::from_secs(1), task)
        .await
        .expect("cancellation should finish promptly")
        .expect("request task should not panic");
    assert!(matches!(result, Err(KasbError::Cancelled)));
}
