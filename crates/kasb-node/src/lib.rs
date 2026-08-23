#![cfg_attr(test, allow(dead_code))]

#[cfg(all(feature = "feasibility-judge", not(debug_assertions)))]
compile_error!("the feasibility-judge probes cannot be compiled into a release artifact");

use std::{
    cell::Cell,
    future::Future,
    panic::{self, AssertUnwindSafe},
    pin::Pin,
    sync::OnceLock,
    task::{Context, Poll},
};

#[cfg(feature = "feasibility-judge")]
use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

use futures_util::FutureExt;
#[cfg(feature = "feasibility-judge")]
use kasb::{
    FixedClock,
    http::{HttpResponse, HttpTransport, TransportError},
};
use kasb::{
    KasbClient, KasbError, KasbFailure, SystemClock,
    http::{CancellationToken, PersonaClient, PersonaConfig},
};
use napi::{
    Env,
    bindgen_prelude::{AbortSignal, AsyncBlock, AsyncBlockBuilder},
};
use napi_derive::napi;
#[cfg(feature = "feasibility-judge")]
use serde::Deserialize;
use serde_json::{Value, json};

type SharedClient = KasbClient<PersonaClient, SystemClock>;

#[cfg(feature = "feasibility-judge")]
type FixtureRoutes = Arc<HashMap<String, FixtureResponse>>;

#[cfg(feature = "feasibility-judge")]
static FIXTURE_REQUEST_STARTED: AtomicBool = AtomicBool::new(false);

enum Operation {
    Invalid,
    SearchStandards(String),
    GetStandardStructure(String),
    GetSection(String),
    GetParagraph(String),
    SearchQna(String),
    GetQna(String),
    #[cfg(feature = "feasibility-judge")]
    FixtureGetParagraph(String),
    #[cfg(feature = "feasibility-judge")]
    CancellationProbe,
    #[cfg(feature = "feasibility-judge")]
    PanicProbe,
}

#[cfg(feature = "feasibility-judge")]
#[derive(Clone, Debug)]
struct FixtureTransport;

#[cfg(feature = "feasibility-judge")]
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FixtureConfiguration {
    routes: Vec<FixtureRoute>,
}

#[cfg(feature = "feasibility-judge")]
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FixtureRoute {
    request_url: String,
    payload: Value,
    #[serde(default)]
    wait_for_cancellation: bool,
    #[serde(default)]
    panic: bool,
}

#[cfg(feature = "feasibility-judge")]
#[derive(Clone, Debug)]
struct FixtureResponse {
    response: HttpResponse,
    wait_for_cancellation: bool,
    panic: bool,
}

#[cfg(feature = "feasibility-judge")]
#[derive(Clone, Debug)]
struct ConfiguredFixtureTransport {
    routes: FixtureRoutes,
    requests: Arc<std::sync::Mutex<Vec<String>>>,
}

enum BindingError {
    Capability(KasbFailure),
    Cancelled,
    Internal,
    InvalidJson,
    InvalidOperation,
}

#[napi(js_name = "executeOperation")]
fn execute_operation(
    env: Env,
    operation_name: String,
    input_json: String,
    signal: Option<AbortSignal>,
    pre_aborted: Option<bool>,
) -> napi::Result<AsyncBlock<String>> {
    let operation = match operation_name.as_str() {
        "search-standards" => Operation::SearchStandards(input_json),
        "get-standard-structure" => Operation::GetStandardStructure(input_json),
        "get-section" => Operation::GetSection(input_json),
        "get-paragraph" => Operation::GetParagraph(input_json),
        "search-qna" => Operation::SearchQna(input_json),
        "get-qna" => Operation::GetQna(input_json),
        _ => {
            return task(
                &env,
                Operation::Invalid,
                signal,
                pre_aborted.unwrap_or(false),
            );
        }
    };
    task(&env, operation, signal, pre_aborted.unwrap_or(false))
}

#[cfg(feature = "feasibility-judge")]
#[napi(js_name = "configureFixture")]
fn configure_fixture(configuration_json: String) -> napi::Result<()> {
    let configuration: FixtureConfiguration = serde_json::from_str(&configuration_json)
        .map_err(|_| napi::Error::from_reason("invalid fixture configuration"))?;
    let mut routes = HashMap::with_capacity(configuration.routes.len());
    for route in configuration.routes {
        let response = FixtureResponse {
            response: HttpResponse {
                status: 200,
                body: serde_json::to_vec(&route.payload)
                    .map_err(|_| napi::Error::from_reason("invalid fixture payload"))?,
            },
            wait_for_cancellation: route.wait_for_cancellation,
            panic: route.panic,
        };
        if routes.insert(route.request_url, response).is_some() {
            return Err(napi::Error::from_reason("duplicate fixture route"));
        }
    }
    fixture_configuration()
        .lock()
        .map_err(|_| napi::Error::from_reason("fixture configuration lock failed"))?
        .replace(Arc::new(routes));
    FIXTURE_REQUEST_STARTED.store(false, Ordering::Release);
    Ok(())
}

#[cfg(feature = "feasibility-judge")]
#[napi(js_name = "fixtureRequestStarted")]
fn fixture_request_started() -> bool {
    FIXTURE_REQUEST_STARTED.load(Ordering::Acquire)
}

#[cfg(feature = "feasibility-judge")]
#[napi(js_name = "fixtureGetParagraph")]
fn fixture_get_paragraph(env: Env, input_json: String) -> napi::Result<AsyncBlock<String>> {
    task(
        &env,
        Operation::FixtureGetParagraph(input_json),
        None,
        false,
    )
}

#[cfg(feature = "feasibility-judge")]
#[napi(js_name = "cancellationProbe")]
fn cancellation_probe(
    env: Env,
    signal: Option<AbortSignal>,
    pre_aborted: Option<bool>,
) -> napi::Result<AsyncBlock<String>> {
    task(
        &env,
        Operation::CancellationProbe,
        signal,
        pre_aborted.unwrap_or(false),
    )
}

#[cfg(feature = "feasibility-judge")]
#[napi(js_name = "panicProbe")]
fn panic_probe(env: Env) -> napi::Result<AsyncBlock<String>> {
    task(&env, Operation::PanicProbe, None, false)
}

fn task(
    env: &Env,
    operation: Operation,
    signal: Option<AbortSignal>,
    pre_aborted: bool,
) -> napi::Result<AsyncBlock<String>> {
    install_sanitizing_panic_hook();
    let cancellation = CancellationToken::new();
    if pre_aborted {
        cancellation.cancel();
    }
    if let Some(signal) = signal {
        let token = cancellation.clone();
        signal.on_abort(move || token.cancel());
    }

    let future = async move {
        let outcome = AssertUnwindSafe(SanitizedPanicFuture::new(execute(operation, cancellation)))
            .catch_unwind()
            .await;
        let envelope = match outcome {
            Ok(Ok(value)) => json!({ "ok": true, "value": value }),
            Ok(Err(error)) => error_envelope(error),
            Err(_) => contained_panic_envelope(),
        };
        serde_json::to_string(&envelope)
            .map_err(|_| napi::Error::from_reason("native result serialization failed"))
    };
    AsyncBlockBuilder::new(future).build(env)
}

fn contained_panic_envelope() -> Value {
    let mut envelope = error_envelope(BindingError::Internal);
    if let Value::Object(fields) = &mut envelope {
        fields.insert("operatorSignal".into(), json!("binding_panic"));
    }
    envelope
}

fn install_sanitizing_panic_hook() {
    static INSTALLED: OnceLock<()> = OnceLock::new();
    INSTALLED.get_or_init(|| {
        let previous = panic::take_hook();
        panic::set_hook(Box::new(move |information| {
            let suppress = SANITIZE_PANIC.with(|depth| depth.get() > 0);
            if !suppress {
                previous(information);
            }
        }));
    });
}

thread_local! {
    static SANITIZE_PANIC: Cell<usize> = const { Cell::new(0) };
}

struct PanicSanitizationGuard;

impl PanicSanitizationGuard {
    fn enter() -> Self {
        SANITIZE_PANIC.with(|depth| depth.set(depth.get() + 1));
        Self
    }
}

impl Drop for PanicSanitizationGuard {
    fn drop(&mut self) {
        SANITIZE_PANIC.with(|depth| depth.set(depth.get().saturating_sub(1)));
    }
}

struct SanitizedPanicFuture<F> {
    inner: Pin<Box<F>>,
}

impl<F> SanitizedPanicFuture<F> {
    fn new(inner: F) -> Self {
        Self {
            inner: Box::pin(inner),
        }
    }
}

impl<F: Future> Future for SanitizedPanicFuture<F> {
    type Output = F::Output;

    fn poll(mut self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<Self::Output> {
        let _guard = PanicSanitizationGuard::enter();
        self.inner.as_mut().poll(context)
    }
}

async fn execute(
    operation: Operation,
    cancellation: CancellationToken,
) -> Result<Value, BindingError> {
    #[cfg(feature = "feasibility-judge")]
    if operation.is_public() {
        let routes = fixture_configuration()
            .lock()
            .map_err(|_| BindingError::Internal)?
            .clone();
        if let Some(routes) = routes {
            return execute_fixture(operation, cancellation, routes).await;
        }
    }

    match operation {
        Operation::Invalid => Err(BindingError::InvalidOperation),
        Operation::SearchStandards(input_json) => to_value(
            shared_client()?
                .execute_search_standards(parse_input(&input_json)?, &cancellation)
                .await,
        ),
        Operation::GetStandardStructure(input_json) => to_value(
            shared_client()?
                .execute_get_standard_structure(parse_input(&input_json)?, &cancellation)
                .await,
        ),
        Operation::GetSection(input_json) => to_value(
            shared_client()?
                .execute_get_section(parse_input(&input_json)?, &cancellation)
                .await,
        ),
        Operation::GetParagraph(input_json) => to_value(
            shared_client()?
                .execute_get_paragraph(parse_input(&input_json)?, &cancellation)
                .await,
        ),
        Operation::SearchQna(input_json) => to_value(
            shared_client()?
                .execute_search_qna(parse_input(&input_json)?, &cancellation)
                .await,
        ),
        Operation::GetQna(input_json) => to_value(
            shared_client()?
                .execute_get_qna(parse_input(&input_json)?, &cancellation)
                .await,
        ),
        #[cfg(feature = "feasibility-judge")]
        Operation::FixtureGetParagraph(input_json) => {
            let client = KasbClient::from_parts(
                FixtureTransport,
                FixedClock::new("2026-05-18T00:00:00.000Z"),
            );
            to_value(
                client
                    .execute_get_paragraph(parse_input(&input_json)?, &cancellation)
                    .await,
            )
        }
        #[cfg(feature = "feasibility-judge")]
        Operation::CancellationProbe => {
            cancellation.cancelled().await;
            Err(BindingError::Cancelled)
        }
        #[cfg(feature = "feasibility-judge")]
        Operation::PanicProbe => panic!("deliberate feasibility panic"),
    }
}

#[cfg(feature = "feasibility-judge")]
impl Operation {
    fn is_public(&self) -> bool {
        matches!(
            self,
            Self::SearchStandards(_)
                | Self::GetStandardStructure(_)
                | Self::GetSection(_)
                | Self::GetParagraph(_)
                | Self::SearchQna(_)
                | Self::GetQna(_)
        )
    }
}

#[cfg(feature = "feasibility-judge")]
fn fixture_configuration() -> &'static std::sync::Mutex<Option<FixtureRoutes>> {
    static CONFIGURATION: OnceLock<std::sync::Mutex<Option<FixtureRoutes>>> = OnceLock::new();
    CONFIGURATION.get_or_init(|| std::sync::Mutex::new(None))
}

#[cfg(feature = "feasibility-judge")]
async fn execute_fixture(
    operation: Operation,
    cancellation: CancellationToken,
    routes: FixtureRoutes,
) -> Result<Value, BindingError> {
    let transport = ConfiguredFixtureTransport {
        routes,
        requests: Arc::default(),
    };
    let client = KasbClient::from_parts(
        transport.clone(),
        FixedClock::new("2026-05-18T00:00:00.000Z"),
    );
    let result = match operation {
        Operation::SearchStandards(input) => to_value(
            client
                .execute_search_standards(parse_input(&input)?, &cancellation)
                .await,
        ),
        Operation::GetStandardStructure(input) => to_value(
            client
                .execute_get_standard_structure(parse_input(&input)?, &cancellation)
                .await,
        ),
        Operation::GetSection(input) => to_value(
            client
                .execute_get_section(parse_input(&input)?, &cancellation)
                .await,
        ),
        Operation::GetParagraph(input) => to_value(
            client
                .execute_get_paragraph(parse_input(&input)?, &cancellation)
                .await,
        ),
        Operation::SearchQna(input) => to_value(
            client
                .execute_search_qna(parse_input(&input)?, &cancellation)
                .await,
        ),
        Operation::GetQna(input) => to_value(
            client
                .execute_get_qna(parse_input(&input)?, &cancellation)
                .await,
        ),
        _ => Err(BindingError::InvalidOperation),
    };
    if !transport.used_exactly_once()? {
        return Err(BindingError::Internal);
    }
    result
}

fn parse_input(input_json: &str) -> Result<Value, BindingError> {
    serde_json::from_str(input_json).map_err(|_| BindingError::InvalidJson)
}

fn to_value<T: serde::Serialize>(result: Result<T, KasbError>) -> Result<Value, BindingError> {
    serde_json::to_value(result.map_err(BindingError::from)?).map_err(|_| BindingError::Internal)
}

#[cfg(feature = "feasibility-judge")]
impl HttpTransport for FixtureTransport {
    #[allow(clippy::manual_async_fn)]
    fn get<'a>(
        &'a self,
        url: &'a str,
        _cancellation: &'a CancellationToken,
    ) -> impl Future<Output = Result<HttpResponse, TransportError>> + Send + 'a {
        async move {
            let body = if url == "https://db.kasb.or.kr/api/paragraphs/content/1116/23" {
                include_bytes!("../../../fixtures/kasb/paragraph-1116-23.json").as_slice()
            } else if url == "https://db.kasb.or.kr/api/standard-indexes/1116" {
                include_bytes!("../../../fixtures/kasb/standard-indexes-1116.json").as_slice()
            } else {
                return Err(TransportError::Unavailable(format!(
                    "no feasibility fixture route for {url}"
                )));
            };
            Ok(HttpResponse {
                status: 200,
                body: body.to_vec(),
            })
        }
    }
}

#[cfg(feature = "feasibility-judge")]
impl ConfiguredFixtureTransport {
    fn used_exactly_once(&self) -> Result<bool, BindingError> {
        let mut expected = self.routes.keys().cloned().collect::<Vec<_>>();
        let mut actual = self
            .requests
            .lock()
            .map_err(|_| BindingError::Internal)?
            .clone();
        expected.sort();
        actual.sort();
        Ok(expected == actual)
    }
}

#[cfg(feature = "feasibility-judge")]
impl HttpTransport for ConfiguredFixtureTransport {
    #[allow(clippy::manual_async_fn)]
    fn get<'a>(
        &'a self,
        url: &'a str,
        cancellation: &'a CancellationToken,
    ) -> impl Future<Output = Result<HttpResponse, TransportError>> + Send + 'a {
        let response = self.routes.get(url).cloned();
        if let Ok(mut requests) = self.requests.lock() {
            requests.push(url.to_owned());
            FIXTURE_REQUEST_STARTED.store(true, Ordering::Release);
        }
        async move {
            let fixture = response.ok_or_else(|| {
                TransportError::Unavailable(format!("undeclared fixture request: {url}"))
            })?;
            assert!(!fixture.panic, "deliberate configured fixture panic");
            if fixture.wait_for_cancellation {
                cancellation.cancelled().await;
                return Err(TransportError::Cancelled);
            }
            Ok(fixture.response)
        }
    }
}

fn shared_client() -> Result<&'static SharedClient, BindingError> {
    static CLIENT: OnceLock<Result<SharedClient, ()>> = OnceLock::new();
    CLIENT
        .get_or_init(|| KasbClient::new(PersonaConfig::default()).map_err(|_| ()))
        .as_ref()
        .map_err(|_| BindingError::Internal)
}

impl From<KasbError> for BindingError {
    fn from(error: KasbError) -> Self {
        match error {
            KasbError::Cancelled => Self::Cancelled,
            KasbError::Failure(failure) => Self::Capability(failure),
        }
    }
}

fn error_envelope(error: BindingError) -> Value {
    match error {
        BindingError::Capability(failure) => capability_error_envelope(failure),
        BindingError::Cancelled => json!({
            "ok": false,
            "cancelled": true,
            "error": {
                "message": "KASB request was cancelled",
                "retryable": true
            }
        }),
        BindingError::Internal => json!({
            "ok": false,
            "error": {
                "code": "internal_failure",
                "message": "The native KASB binding failed internally.",
                "retryable": false
            }
        }),
        BindingError::InvalidJson => json!({
            "ok": false,
            "error": {
                "code": "invalid_input",
                "message": "Native input must be valid JSON.",
                "retryable": false,
                "parameter": "input"
            }
        }),
        BindingError::InvalidOperation => json!({
            "ok": false,
            "error": {
                "code": "invalid_input",
                "message": "Native operation must be one of the six KASB v1 operation names.",
                "retryable": false,
                "parameter": "operationName"
            }
        }),
    }
}

fn capability_error_envelope(failure: KasbFailure) -> Value {
    let mut details = serde_json::Map::new();
    details.insert("code".into(), json!(failure.code));
    details.insert("message".into(), json!(failure.message));
    details.insert("retryable".into(), json!(failure.retryable));
    if let Some(parameter) = failure.parameter {
        details.insert("parameter".into(), json!(parameter));
    }
    if let Some(source_url) = failure.source_url {
        details.insert("sourceUrl".into(), json!(source_url));
    }
    json!({ "ok": false, "error": details })
}

#[cfg(test)]
mod tests {
    use super::*;
    use kasb::KasbFailureCode;

    #[test]
    fn capability_projection_has_an_explicit_wire_allowlist() {
        let envelope = capability_error_envelope(KasbFailure {
            code: KasbFailureCode::SourceChanged,
            message: "provider changed".to_owned(),
            retryable: false,
            parameter: Some("stdNum".to_owned()),
            source_url: Some("https://db.kasb.or.kr/api/standard".to_owned()),
        });
        let details = envelope["error"].as_object().expect("error object");
        assert_eq!(
            details.keys().map(String::as_str).collect::<Vec<_>>(),
            ["code", "message", "retryable", "parameter", "sourceUrl"]
        );
    }

    #[test]
    fn only_the_contained_panic_envelope_carries_the_operator_signal() {
        let ordinary = error_envelope(BindingError::Internal);
        assert!(ordinary.get("operatorSignal").is_none());

        let panicked = contained_panic_envelope();
        assert_eq!(panicked["operatorSignal"], "binding_panic");
        assert_eq!(panicked["error"]["code"], "internal_failure");
        assert_eq!(
            panicked["error"].as_object().expect("error object").len(),
            3
        );
    }
}
