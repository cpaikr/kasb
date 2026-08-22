//! Fixture transport used only by the process-isolated CLI conformance judge.

use std::collections::HashMap;
use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::future::{Future, pending};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use kasb::http::{CancellationToken, HttpResponse, HttpTransport, TransportError};
use kasb::{FixedClock, KasbClient};
use serde::Deserialize;
use serde_json::Value;

use crate::{CliProcessOutput, run_with_client_factory};

const CONFIG_ENV: &str = "KASB_CLI_CONFORMANCE_CONFIG";
const FIXED_NOW: &str = "2026-05-18T00:00:00.000Z";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FixtureConfig {
    routes: Vec<FixtureRoute>,
    calls_path: PathBuf,
    #[serde(default)]
    ready_path: Option<PathBuf>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FixtureRoute {
    request_url: String,
    payload: Value,
    #[serde(default = "success_status")]
    status: u16,
    #[serde(default)]
    pending: bool,
}

const fn success_status() -> u16 {
    200
}

#[derive(Clone, Debug)]
struct FixtureOutcome {
    response: HttpResponse,
    pending: bool,
}

#[derive(Clone, Debug)]
struct FixtureTransport {
    routes: Arc<HashMap<String, FixtureOutcome>>,
    calls_path: Arc<PathBuf>,
    call_log_lock: Arc<Mutex<()>>,
    ready_path: Option<Arc<PathBuf>>,
}

impl FixtureTransport {
    fn from_config(config: FixtureConfig) -> Result<Self, ()> {
        let mut routes = HashMap::with_capacity(config.routes.len());
        for route in config.routes {
            let body = serde_json::to_vec(&route.payload).map_err(|_| ())?;
            let outcome = FixtureOutcome {
                response: HttpResponse {
                    status: route.status,
                    body,
                },
                pending: route.pending,
            };
            if routes.insert(route.request_url, outcome).is_some() {
                return Err(());
            }
        }
        Ok(Self {
            routes: Arc::new(routes),
            calls_path: Arc::new(config.calls_path),
            call_log_lock: Arc::new(Mutex::new(())),
            ready_path: config.ready_path.map(Arc::new),
        })
    }

    fn record_call(&self, url: &str) -> Result<(), TransportError> {
        let _guard = self.call_log_lock.lock().map_err(|_| fixture_failure())?;
        let line = serde_json::to_string(url).map_err(|_| fixture_failure())?;
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.calls_path.as_ref())
            .map_err(|_| fixture_failure())?;
        writeln!(file, "{line}").map_err(|_| fixture_failure())
    }

    fn signal_ready(&self) -> Result<(), TransportError> {
        match self.ready_path.as_deref() {
            Some(path) => fs::write(path, b"ready\n").map_err(|_| fixture_failure()),
            None => Ok(()),
        }
    }
}

impl HttpTransport for FixtureTransport {
    #[allow(clippy::manual_async_fn)]
    fn get<'a>(
        &'a self,
        url: &'a str,
        _cancellation: &'a CancellationToken,
    ) -> impl Future<Output = Result<HttpResponse, TransportError>> + Send + 'a {
        async move {
            self.record_call(url)?;
            let outcome = self.routes.get(url).cloned().ok_or_else(fixture_failure)?;
            if outcome.pending {
                self.signal_ready()?;
                pending::<()>().await;
                unreachable!("the pending conformance route never completes");
            }
            Ok(outcome.response)
        }
    }
}

fn fixture_failure() -> TransportError {
    TransportError::Unavailable("fixture transport failed".to_owned())
}

/// Runs the real CLI with a fixture transport when the judge configures one.
///
/// A missing environment variable means this is an ordinary invocation. Any
/// invalid judge configuration produces the same sanitized initialization
/// envelope as a production transport construction failure.
pub async fn try_run(argv: &[OsString]) -> Option<CliProcessOutput> {
    let config_path = std::env::var_os(CONFIG_ENV)?;
    let output = run_with_client_factory(argv.iter().cloned(), &CancellationToken::new(), || {
        load_transport(Path::new(&config_path))
            .map(|transport| KasbClient::from_parts(transport, FixedClock::new(FIXED_NOW)))
    })
    .await;
    Some(output)
}

fn load_transport(path: &Path) -> Result<FixtureTransport, ()> {
    let bytes = fs::read(path).map_err(|_| ())?;
    let config = serde_json::from_slice::<FixtureConfig>(&bytes).map_err(|_| ())?;
    FixtureTransport::from_config(config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_duplicate_routes() {
        let config = FixtureConfig {
            routes: vec![
                FixtureRoute {
                    request_url: "https://example.test/value".to_owned(),
                    payload: Value::Null,
                    status: 200,
                    pending: false,
                },
                FixtureRoute {
                    request_url: "https://example.test/value".to_owned(),
                    payload: Value::Null,
                    status: 200,
                    pending: false,
                },
            ],
            calls_path: PathBuf::from("unused"),
            ready_path: None,
        };

        assert!(FixtureTransport::from_config(config).is_err());
    }
}
