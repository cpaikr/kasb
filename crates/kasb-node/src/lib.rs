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

use futures_util::FutureExt;
#[cfg(feature = "feasibility-judge")]
use kasb::{
    FixedClock,
    http::{HttpResponse, HttpTransport, TransportError},
};
use kasb::{
    KasbClient, KasbError, KasbFailure, SystemClock,
    capabilities::get_paragraph::GetParagraphRequest,
    http::{CancellationToken, PersonaClient, PersonaConfig},
};
use napi::{
    Env,
    bindgen_prelude::{AbortSignal, AsyncBlock, AsyncBlockBuilder},
};
use napi_derive::napi;
use serde_json::{Value, json};

type SharedClient = KasbClient<PersonaClient, SystemClock>;

enum Operation {
    GetParagraph(String),
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

enum BindingError {
    Capability(KasbFailure),
    Cancelled,
    Internal,
    InvalidJson,
}

#[napi(js_name = "getParagraph")]
fn get_paragraph(
    env: Env,
    input_json: String,
    signal: Option<AbortSignal>,
    pre_aborted: Option<bool>,
) -> napi::Result<AsyncBlock<String>> {
    task(
        &env,
        Operation::GetParagraph(input_json),
        signal,
        pre_aborted.unwrap_or(false),
    )
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
            Err(_) => error_envelope(BindingError::Internal),
        };
        serde_json::to_string(&envelope)
            .map_err(|_| napi::Error::from_reason("native result serialization failed"))
    };
    AsyncBlockBuilder::new(future).build(env)
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
    match operation {
        Operation::GetParagraph(input_json) => {
            let input = serde_json::from_str(&input_json).map_err(|_| BindingError::InvalidJson)?;
            let request =
                GetParagraphRequest::from_json(input).map_err(BindingError::Capability)?;
            let result = shared_client()?
                .get_paragraph(request, &cancellation)
                .await
                .map_err(BindingError::from)?;
            serde_json::to_value(result).map_err(|_| BindingError::Internal)
        }
        #[cfg(feature = "feasibility-judge")]
        Operation::FixtureGetParagraph(input_json) => {
            let input = serde_json::from_str(&input_json).map_err(|_| BindingError::InvalidJson)?;
            let request =
                GetParagraphRequest::from_json(input).map_err(BindingError::Capability)?;
            let client = KasbClient::from_parts(
                FixtureTransport,
                FixedClock::new("2026-05-18T00:00:00.000Z"),
            );
            let result = client
                .get_paragraph(request, &cancellation)
                .await
                .map_err(BindingError::from)?;
            serde_json::to_value(result).map_err(|_| BindingError::Internal)
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

fn shared_client() -> Result<&'static SharedClient, BindingError> {
    static CLIENT: OnceLock<SharedClient> = OnceLock::new();
    if let Some(client) = CLIENT.get() {
        return Ok(client);
    }

    let client = KasbClient::new(PersonaConfig::default()).map_err(|_| BindingError::Internal)?;
    let _ = CLIENT.set(client);
    CLIENT.get().ok_or(BindingError::Internal)
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
}
