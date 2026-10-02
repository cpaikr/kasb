use std::future::Future;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use futures_util::StreamExt;
use tokio::sync::{Mutex, Semaphore};
use tokio_util::sync::CancellationToken;
use wreq::header::{ACCEPT, ACCEPT_LANGUAGE as ACCEPT_LANGUAGE_HEADER, HeaderMap, RETRY_AFTER};
use wreq_util::Emulation;

use super::pacing::{
    self, EffectivePacing, MAX_REQUEST_INTERVAL, PacingError, PacingOutcome, PacingPermit,
};

pub const ACCEPT_LANGUAGE: &str = "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7";
/// Maximum decoded body size accepted from a successful KASB response.
pub const MAX_RESPONSE_BYTES: usize = 8 * 1024 * 1024;
/// Shared cooldown recorded after HTTP 429 when KASB sends no usable
/// `Retry-After`, so no local process retries a rate limit immediately.
pub const RATE_LIMIT_COOLDOWN: Duration = Duration::from_secs(10);

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PersonaConfig {
    pub proxy_url: Option<String>,
    pub max_in_flight: usize,
    pub request_timeout: Duration,
    pub connect_timeout: Duration,
    pub pool_idle_timeout: Duration,
    pub pool_max_idle_per_host: usize,
    /// Minimum cooldown before each request, shared by every local process
    /// using the same pacing state. `None` defers to
    /// [`REQUEST_INTERVAL_ENV`](super::REQUEST_INTERVAL_ENV), then
    /// [`DEFAULT_REQUEST_INTERVAL`](super::DEFAULT_REQUEST_INTERVAL). Zero
    /// disables pacing and is meant only for controlled test origins.
    pub request_interval: Option<Duration>,
    /// Absolute pacing state directory. `None` defers to
    /// [`STATE_DIR_ENV`](super::STATE_DIR_ENV), then the per-user state
    /// directory.
    pub state_dir: Option<PathBuf>,
}

impl Default for PersonaConfig {
    fn default() -> Self {
        Self {
            proxy_url: None,
            max_in_flight: 8,
            request_timeout: Duration::from_secs(15),
            connect_timeout: Duration::from_secs(10),
            pool_idle_timeout: Duration::from_secs(90),
            pool_max_idle_per_host: 8,
            request_interval: None,
            state_dir: None,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum PersonaBuildError {
    #[error("persona max_in_flight must be greater than zero")]
    InvalidConcurrency,
    #[error("persona request_interval must not exceed 60000 milliseconds")]
    InvalidRequestInterval,
    #[error("persona state_dir must be an absolute directory path")]
    InvalidStateDirectory,
    #[error("could not build the wreq persona client")]
    Wreq(#[source] wreq::Error),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HttpResponse {
    pub status: u16,
    pub body: Vec<u8>,
}

#[derive(Clone, Debug, Eq, PartialEq, thiserror::Error)]
pub enum TransportError {
    #[error("request cancelled")]
    Cancelled,
    #[error("request timed out")]
    Timeout,
    #[error("request failed: {0}")]
    Unavailable(String),
    #[error("successful response body exceeded the {limit}-byte limit")]
    ResponseTooLarge { limit: usize },
    #[error(transparent)]
    Pacing(#[from] PacingError),
}

pub trait HttpTransport: Send + Sync {
    // RPIT keeps the returned future `Send`, which public async trait methods
    // cannot express on the crate's Rust 1.88 baseline.
    fn get<'a>(
        &'a self,
        url: &'a str,
        cancellation: &'a CancellationToken,
    ) -> impl Future<Output = Result<HttpResponse, TransportError>> + Send + 'a;
}

/// A coherent browser persona. Clone it to reuse the same connection pool,
/// cookie store, proxy affinity, concurrency budget, and pacing gate.
#[derive(Clone)]
pub struct PersonaClient {
    client: wreq::Client,
    permits: Arc<Semaphore>,
    request_interval: Option<Duration>,
    state_dir: Option<PathBuf>,
    // Serializes this persona's paced requests so only one task polls the
    // shared file lock at a time.
    pacing_gate: Arc<Mutex<()>>,
}

impl PersonaClient {
    pub fn new(config: PersonaConfig) -> Result<Self, PersonaBuildError> {
        if config.max_in_flight == 0 {
            return Err(PersonaBuildError::InvalidConcurrency);
        }
        if config
            .request_interval
            .is_some_and(|interval| interval > MAX_REQUEST_INTERVAL)
        {
            return Err(PersonaBuildError::InvalidRequestInterval);
        }
        if config
            .state_dir
            .as_ref()
            .is_some_and(|directory| !directory.is_absolute())
        {
            return Err(PersonaBuildError::InvalidStateDirectory);
        }

        let mut builder = wreq::Client::builder()
            .emulation(Emulation::Chrome131)
            .cookie_store(true)
            .timeout(config.request_timeout)
            .connect_timeout(config.connect_timeout)
            .pool_idle_timeout(config.pool_idle_timeout)
            .pool_max_idle_per_host(config.pool_max_idle_per_host)
            .retry(wreq::retry::Policy::never());

        if let Some(proxy_url) = config.proxy_url.as_deref() {
            let proxy = wreq::Proxy::all(proxy_url).map_err(PersonaBuildError::Wreq)?;
            builder = builder.proxy(proxy);
        }

        let client = builder.build().map_err(PersonaBuildError::Wreq)?;
        Ok(Self {
            client,
            permits: Arc::new(Semaphore::new(config.max_in_flight)),
            request_interval: config.request_interval,
            state_dir: config.state_dir,
            pacing_gate: Arc::new(Mutex::new(())),
        })
    }

    /// Returns a persona sharing this one's connection pool, cookies,
    /// concurrency budget, and pacing gate, with a different explicit
    /// interval. `None` restores environment and default resolution.
    pub fn with_request_interval(
        &self,
        request_interval: Option<Duration>,
    ) -> Result<Self, PersonaBuildError> {
        if request_interval.is_some_and(|interval| interval > MAX_REQUEST_INTERVAL) {
            return Err(PersonaBuildError::InvalidRequestInterval);
        }
        Ok(Self {
            request_interval,
            ..self.clone()
        })
    }

    /// Resolves the pacing policy the next request will use. The environment
    /// is read per request, so construction never fails on pacing settings.
    pub fn effective_pacing(&self) -> Result<EffectivePacing, PacingError> {
        pacing::resolve_pacing(self.request_interval, self.state_dir.as_deref())
    }

    async fn send(
        &self,
        url: &str,
        cancellation: &CancellationToken,
        pacing_permit: Option<PacingPermit>,
    ) -> Result<HttpResponse, TransportError> {
        let _permit = tokio::select! {
            biased;
            _ = cancellation.cancelled() => return Err(TransportError::Cancelled),
            permit = self.permits.acquire() => permit.map_err(|_| {
                TransportError::Unavailable("persona concurrency limiter closed".to_owned())
            })?,
        };

        let response = tokio::select! {
            biased;
            _ = cancellation.cancelled() => return Err(TransportError::Cancelled),
            response = self.client
                .get(url)
                .header(ACCEPT, "application/json")
                .header(ACCEPT_LANGUAGE_HEADER, ACCEPT_LANGUAGE)
                .send() => response.map_err(map_wreq_error)?,
        };

        let status = response.status().as_u16();
        if !(200..300).contains(&status) {
            if status == 429
                && let Some(pacing_permit) = pacing_permit
            {
                let cooldown = retry_after(response.headers()).unwrap_or(RATE_LIMIT_COOLDOWN);
                // Best effort: this request was paced, and a state write
                // failure must not hide the rate limit from the caller.
                let _ = pacing_permit.extend_cooldown(cooldown).await;
            }
            return Ok(HttpResponse {
                status,
                body: Vec::new(),
            });
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
        {
            return Err(response_too_large());
        }
        let mut body = Vec::with_capacity(
            response
                .content_length()
                .unwrap_or_default()
                .min(MAX_RESPONSE_BYTES as u64) as usize,
        );
        let mut chunks = response.bytes_stream();
        loop {
            let chunk = tokio::select! {
                biased;
                _ = cancellation.cancelled() => return Err(TransportError::Cancelled),
                chunk = chunks.next() => chunk,
            };
            let Some(chunk) = chunk else { break };
            let chunk = chunk.map_err(map_wreq_error)?;
            if body.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
                return Err(response_too_large());
            }
            body.extend_from_slice(&chunk);
        }

        Ok(HttpResponse { status, body })
    }
}

impl Default for PersonaClient {
    /// Builds the default browser-persona client.
    ///
    /// # Panics
    ///
    /// Panics if `wreq` cannot construct a client from the library-owned
    /// default configuration. Use [`PersonaClient::new`] to handle that
    /// construction failure explicitly.
    fn default() -> Self {
        Self::new(PersonaConfig::default()).expect("default persona configuration is valid")
    }
}

impl HttpTransport for PersonaClient {
    #[allow(clippy::manual_async_fn)]
    fn get<'a>(
        &'a self,
        url: &'a str,
        cancellation: &'a CancellationToken,
    ) -> impl Future<Output = Result<HttpResponse, TransportError>> + Send + 'a {
        async move {
            let pacing = self.effective_pacing()?;
            if pacing.lock_path.is_none() {
                return self.send(url, cancellation, None).await;
            }
            let _gate = tokio::select! {
                biased;
                _ = cancellation.cancelled() => return Err(TransportError::Cancelled),
                gate = self.pacing_gate.lock() => gate,
            };
            // Pacing precedes the HTTP deadline, and the permit is held through
            // the body so the next cooldown starts after this response.
            match pacing::acquire(&pacing, cancellation).await? {
                PacingOutcome::Cancelled => Err(TransportError::Cancelled),
                PacingOutcome::Ready(permit) => self.send(url, cancellation, permit).await,
            }
        }
    }
}

/// Reads a delta-seconds `Retry-After`. HTTP-date values fall back to the
/// fixed rate-limit cooldown rather than depending on the local clock.
fn retry_after(headers: &HeaderMap) -> Option<Duration> {
    let value = headers.get(RETRY_AFTER)?.to_str().ok()?.trim();
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    value.parse::<u64>().ok().map(Duration::from_secs)
}

fn response_too_large() -> TransportError {
    TransportError::ResponseTooLarge {
        limit: MAX_RESPONSE_BYTES,
    }
}

fn map_wreq_error(error: wreq::Error) -> TransportError {
    if error.is_timeout() {
        TransportError::Timeout
    } else {
        TransportError::Unavailable(error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::mpsc;
    use std::thread;
    use std::time::Instant;

    use super::*;

    // Request tests use local origins and must not touch the per-user pacing
    // state.
    fn unpaced() -> PersonaConfig {
        PersonaConfig {
            request_interval: Some(Duration::ZERO),
            ..PersonaConfig::default()
        }
    }

    #[test]
    fn defaults_match_the_approved_persona_policy() {
        let config = PersonaConfig::default();
        assert_eq!(config.max_in_flight, 8);
        assert_eq!(config.request_timeout, Duration::from_secs(15));
        assert_eq!(config.connect_timeout, Duration::from_secs(10));
        assert_eq!(config.pool_idle_timeout, Duration::from_secs(90));
        assert_eq!(config.pool_max_idle_per_host, 8);
        assert_eq!(config.request_interval, None);
        assert_eq!(config.state_dir, None);
        assert_eq!(
            crate::http::DEFAULT_REQUEST_INTERVAL,
            Duration::from_millis(500)
        );
        assert_eq!(ACCEPT_LANGUAGE, "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7");
    }

    #[test]
    fn default_persona_builds_without_network_access() {
        PersonaClient::new(PersonaConfig::default()).expect("persona should build");
    }

    #[test]
    fn rejects_an_unbounded_zero_sized_limiter() {
        let error = PersonaClient::new(PersonaConfig {
            max_in_flight: 0,
            ..PersonaConfig::default()
        })
        .err()
        .expect("zero concurrency should fail");
        assert!(matches!(error, PersonaBuildError::InvalidConcurrency));
    }

    #[test]
    fn rejects_out_of_range_pacing_settings() {
        let error = PersonaClient::new(PersonaConfig {
            request_interval: Some(MAX_REQUEST_INTERVAL + Duration::from_millis(1)),
            ..PersonaConfig::default()
        })
        .err()
        .expect("an interval above the maximum should fail");
        assert!(matches!(error, PersonaBuildError::InvalidRequestInterval));

        let error = PersonaClient::new(PersonaConfig {
            state_dir: Some(PathBuf::from("relative-state")),
            ..PersonaConfig::default()
        })
        .err()
        .expect("a relative state directory should fail");
        assert!(matches!(error, PersonaBuildError::InvalidStateDirectory));
    }

    #[tokio::test]
    async fn paces_requests_and_shares_a_rate_limit_cooldown() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("test listener should bind");
        let address = listener
            .local_addr()
            .expect("listener should have an address");
        let server = thread::spawn(move || {
            let mut arrivals = Vec::new();
            for head in [
                "200 OK\r\nContent-Length: 2",
                "429 Too Many Requests\r\nRetry-After: 1\r\nContent-Length: 0",
                "200 OK\r\nContent-Length: 2",
            ] {
                let (mut stream, _) = listener.accept().expect("test request should connect");
                arrivals.push(Instant::now());
                let mut request = Vec::new();
                let mut buffer = [0_u8; 4096];
                while !request.windows(4).any(|window| window == b"\r\n\r\n") {
                    let count = stream
                        .read(&mut buffer)
                        .expect("request should be readable");
                    assert!(count > 0, "request ended before headers completed");
                    request.extend_from_slice(&buffer[..count]);
                }
                let body = if head.starts_with("200") { "{}" } else { "" };
                write!(stream, "HTTP/1.1 {head}\r\nConnection: close\r\n\r\n{body}")
                    .expect("response should be writable");
            }
            arrivals
        });

        let state = tempfile::tempdir().expect("state directory should be created");
        let config = PersonaConfig {
            request_interval: Some(Duration::from_millis(150)),
            state_dir: Some(state.path().to_path_buf()),
            ..PersonaConfig::default()
        };
        // Separate personas share only the state directory, as separate
        // processes would.
        let first = PersonaClient::new(config.clone()).expect("persona should build");
        let second = PersonaClient::new(config).expect("persona should build");
        let cancellation = CancellationToken::new();
        let url = format!("http://{address}/api");
        let statuses = [
            first.get(&url, &cancellation).await,
            second.get(&url, &cancellation).await,
            first.get(&url, &cancellation).await,
        ]
        .map(|response| response.expect("local request should succeed").status);
        let arrivals = server.join().expect("test server should finish");

        assert_eq!(statuses, [200, 429, 200]);
        assert!(arrivals[1] - arrivals[0] >= Duration::from_millis(150));
        assert!(arrivals[2] - arrivals[1] >= Duration::from_secs(1));
    }

    #[tokio::test]
    async fn sends_coherent_api_headers_and_reuses_in_memory_cookies() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("test listener should bind");
        let address = listener
            .local_addr()
            .expect("listener should have an address");
        let server = thread::spawn(move || {
            let mut requests = Vec::new();
            for index in 0..2 {
                let (mut stream, _) = listener.accept().expect("test request should connect");
                stream
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .expect("read timeout should configure");
                let mut request = Vec::new();
                let mut buffer = [0_u8; 4096];
                while !request.windows(4).any(|window| window == b"\r\n\r\n") {
                    let count = stream
                        .read(&mut buffer)
                        .expect("request should be readable");
                    assert!(count > 0, "request ended before headers completed");
                    request.extend_from_slice(&buffer[..count]);
                }
                requests.push(String::from_utf8(request).expect("headers should be UTF-8"));

                let cookie = if index == 0 {
                    "Set-Cookie: kasb_session=pilot; Path=/\r\n"
                } else {
                    ""
                };
                write!(
                    stream,
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n{cookie}\r\n{{}}"
                )
                .expect("response should be writable");
            }
            requests
        });

        let client = PersonaClient::new(unpaced()).expect("persona should build");
        let cancellation = CancellationToken::new();
        let url = format!("http://{address}/api");
        for _ in 0..2 {
            let response = client
                .get(&url, &cancellation)
                .await
                .expect("local request should succeed");
            assert_eq!(response.status, 200);
            assert_eq!(response.body, b"{}");
        }

        let requests = server.join().expect("test server should finish");
        let first = requests[0].to_ascii_lowercase();
        let second = requests[1].to_ascii_lowercase();
        assert!(first.contains("accept: application/json\r\n"));
        assert!(first.contains(&format!(
            "accept-language: {}\r\n",
            ACCEPT_LANGUAGE.to_ascii_lowercase()
        )));
        assert!(!first.contains("cookie: kasb_session=pilot"));
        assert!(second.contains("cookie: kasb_session=pilot"));
    }

    #[tokio::test]
    async fn returns_error_status_without_waiting_for_its_body() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("test listener should bind");
        let address = listener
            .local_addr()
            .expect("listener should have an address");
        let (release_sender, release_receiver) = mpsc::channel();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("test request should connect");
            let mut request = Vec::new();
            let mut buffer = [0_u8; 4096];
            while !request.windows(4).any(|window| window == b"\r\n\r\n") {
                let count = stream
                    .read(&mut buffer)
                    .expect("request should be readable");
                assert!(count > 0, "request ended before headers completed");
                request.extend_from_slice(&buffer[..count]);
            }
            write!(
                stream,
                "HTTP/1.1 404 Not Found\r\nContent-Length: 100\r\nConnection: close\r\n\r\n"
            )
            .expect("response headers should be writable");
            stream.flush().expect("response headers should flush");
            release_receiver
                .recv_timeout(Duration::from_secs(2))
                .expect("client should return before the error body finishes");
        });

        let client = PersonaClient::new(PersonaConfig {
            request_timeout: Duration::from_millis(500),
            connect_timeout: Duration::from_millis(500),
            ..unpaced()
        })
        .expect("persona should build");
        let response = client
            .get(
                &format!("http://{address}/missing"),
                &CancellationToken::new(),
            )
            .await
            .expect("the known HTTP status should be preserved");
        release_sender
            .send(())
            .expect("test server should still be waiting");
        server.join().expect("test server should finish");

        assert_eq!(response.status, 404);
        assert!(response.body.is_empty());
    }

    #[tokio::test]
    async fn rejects_a_declared_success_body_above_the_byte_limit() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("test listener should bind");
        let address = listener
            .local_addr()
            .expect("listener should have an address");
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("test request should connect");
            let mut request = Vec::new();
            let mut buffer = [0_u8; 4096];
            while !request.windows(4).any(|window| window == b"\r\n\r\n") {
                let count = stream
                    .read(&mut buffer)
                    .expect("request should be readable");
                assert!(count > 0, "request ended before headers completed");
                request.extend_from_slice(&buffer[..count]);
            }
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                MAX_RESPONSE_BYTES + 1
            )
            .expect("response headers should be writable");
        });

        let client = PersonaClient::new(unpaced()).expect("persona should build");
        let result = client
            .get(
                &format!("http://{address}/oversized"),
                &CancellationToken::new(),
            )
            .await;
        server.join().expect("test server should finish");

        assert_eq!(result, Err(response_too_large()));
    }

    #[tokio::test]
    async fn rejects_a_chunked_success_body_above_the_byte_limit() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("test listener should bind");
        let address = listener
            .local_addr()
            .expect("listener should have an address");
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("test request should connect");
            let mut request = Vec::new();
            let mut buffer = [0_u8; 4096];
            while !request.windows(4).any(|window| window == b"\r\n\r\n") {
                let count = stream
                    .read(&mut buffer)
                    .expect("request should be readable");
                assert!(count > 0, "request ended before headers completed");
                request.extend_from_slice(&buffer[..count]);
            }
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n{:x}\r\n",
                MAX_RESPONSE_BYTES + 1
            )
            .expect("chunk header should be writable");
            let body = vec![b'x'; MAX_RESPONSE_BYTES + 1];
            let _ = stream.write_all(&body);
            let _ = stream.write_all(b"\r\n0\r\n\r\n");
        });

        let client = PersonaClient::new(unpaced()).expect("persona should build");
        let result = client
            .get(
                &format!("http://{address}/chunked"),
                &CancellationToken::new(),
            )
            .await;
        server.join().expect("test server should finish");

        assert_eq!(result, Err(response_too_large()));
    }

    #[tokio::test]
    async fn does_not_replay_a_request_after_a_protocol_failure() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("test listener should bind");
        listener
            .set_nonblocking(true)
            .expect("listener should become nonblocking");
        let address = listener
            .local_addr()
            .expect("listener should have an address");
        let done = Arc::new(AtomicBool::new(false));
        let accepted = Arc::new(AtomicUsize::new(0));
        let server_done = Arc::clone(&done);
        let server_accepted = Arc::clone(&accepted);
        let server = thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(3);
            while !server_done.load(Ordering::Acquire) && Instant::now() < deadline {
                match listener.accept() {
                    Ok((stream, _)) => {
                        server_accepted.fetch_add(1, Ordering::AcqRel);
                        drop(stream);
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::yield_now();
                    }
                    Err(error) => panic!("test listener failed: {error}"),
                }
            }
        });

        let client = PersonaClient::new(PersonaConfig {
            request_timeout: Duration::from_secs(1),
            connect_timeout: Duration::from_secs(1),
            ..unpaced()
        })
        .expect("persona should build");
        let result = client
            .get(&format!("http://{address}/api"), &CancellationToken::new())
            .await;
        done.store(true, Ordering::Release);
        server.join().expect("test server should finish");

        assert!(matches!(result, Err(TransportError::Unavailable(_))));
        assert_eq!(accepted.load(Ordering::Acquire), 1);
    }
}
