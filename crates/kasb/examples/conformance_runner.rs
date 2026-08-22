use std::collections::HashMap;
use std::error::Error;
use std::future::Future;
use std::io::{self, Read};
use std::sync::{Arc, Mutex};

use kasb::http::{CancellationToken, HttpResponse, HttpTransport, TransportError};
use kasb::{FixedClock, KasbClient, KasbError};
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunnerRequest {
    protocol_version: u8,
    case_id: String,
    operation: String,
    input: Value,
    routes: Vec<RunnerRoute>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunnerRoute {
    request_url: String,
    payload: Value,
}

#[derive(Clone, Debug, Default)]
struct FixtureTransport {
    routes: Arc<HashMap<String, HttpResponse>>,
    undeclared_requests: Arc<Mutex<Vec<String>>>,
}

impl FixtureTransport {
    fn new(routes: Vec<RunnerRoute>) -> Result<Self, serde_json::Error> {
        let routes = routes
            .into_iter()
            .map(|route| {
                let body = serde_json::to_vec(&route.payload)?;
                Ok((route.request_url, HttpResponse { status: 200, body }))
            })
            .collect::<Result<HashMap<_, _>, serde_json::Error>>()?;
        Ok(Self {
            routes: Arc::new(routes),
            undeclared_requests: Arc::default(),
        })
    }

    fn undeclared_requests(&self) -> Vec<String> {
        self.undeclared_requests
            .lock()
            .expect("undeclared request log lock should work")
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
        let response = self.routes.get(url).cloned();
        if response.is_none() {
            self.undeclared_requests
                .lock()
                .expect("undeclared request log lock should work")
                .push(url.to_owned());
        }
        async move {
            response.ok_or_else(|| {
                TransportError::Unavailable(format!("undeclared conformance request: {url}"))
            })
        }
    }
}

#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), Box<dyn Error>> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;
    let request: RunnerRequest = serde_json::from_str(&input)?;
    if request.protocol_version != 1 {
        return Err(format!(
            "unsupported conformance protocol version: {}",
            request.protocol_version
        )
        .into());
    }
    let transport = FixtureTransport::new(request.routes)?;
    let client = KasbClient::from_parts(
        transport.clone(),
        FixedClock::new("2026-05-18T00:00:00.000Z"),
    );
    let cancellation = CancellationToken::new();
    let result = match request.operation.as_str() {
        "search-standards" => client
            .execute_search_standards(request.input, &cancellation)
            .await
            .and_then(to_value),
        "get-standard-structure" => client
            .execute_get_standard_structure(request.input, &cancellation)
            .await
            .and_then(to_value),
        "get-section" => client
            .execute_get_section(request.input, &cancellation)
            .await
            .and_then(to_value),
        "get-paragraph" => client
            .execute_get_paragraph(request.input, &cancellation)
            .await
            .and_then(to_value),
        "search-qna" => client
            .execute_search_qna(request.input, &cancellation)
            .await
            .and_then(to_value),
        "get-qna" => client
            .execute_get_qna(request.input, &cancellation)
            .await
            .and_then(to_value),
        _ => {
            return Err(format!(
                "Rust SDK conformance runner does not support operation {} for {}",
                request.operation, request.case_id
            )
            .into());
        }
    };
    let outcome = match result {
        Ok(value) => json!({"ok": true, "value": value}),
        Err(KasbError::Failure(error)) => json!({"ok": false, "error": error}),
        Err(KasbError::Cancelled) => {
            return Err("shared conformance cases do not represent cancellation".into());
        }
    };
    let undeclared_requests = transport.undeclared_requests();
    if !undeclared_requests.is_empty() {
        return Err(format!(
            "conformance case {} made undeclared source requests: {}",
            request.case_id,
            undeclared_requests.join(", ")
        )
        .into());
    }

    println!("{}", serde_json::to_string(&outcome)?);
    Ok(())
}

fn to_value<T: serde::Serialize>(value: T) -> Result<Value, KasbError> {
    serde_json::to_value(value).map_err(|_| {
        KasbError::Failure(kasb::KasbFailure {
            code: kasb::KasbFailureCode::InternalFailure,
            message: "Could not serialize the KASB result.".to_owned(),
            retryable: false,
            parameter: None,
            source_url: None,
        })
    })
}
