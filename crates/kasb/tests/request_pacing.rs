//! Cross-process pacing: separate processes that share a state directory must
//! not burst, and environment settings must be validated rather than ignored.
//!
//! The parent test re-executes this test binary; each child performs one
//! request through an environment-configured [`PersonaClient`].

use std::io::{Read, Write};
use std::net::TcpListener;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use kasb::http::{
    CancellationToken, HttpTransport, PacingError, PersonaClient, PersonaConfig,
    REQUEST_INTERVAL_ENV, STATE_DIR_ENV, TransportError,
};

const CHILD_URL_ENV: &str = "KASB_PACING_TEST_URL";
const PROCESSES: usize = 4;
const INTERVAL: Duration = Duration::from_millis(200);

#[tokio::test]
async fn child_request() {
    let Ok(url) = std::env::var(CHILD_URL_ENV) else {
        return;
    };
    let client = PersonaClient::new(PersonaConfig::default()).expect("persona should build");
    let result = client.get(&url, &CancellationToken::new()).await;
    if url == "invalid-interval" {
        assert!(matches!(
            result,
            Err(TransportError::Pacing(PacingError::InvalidSetting {
                setting: REQUEST_INTERVAL_ENV,
                ..
            }))
        ));
    } else {
        assert_eq!(result.expect("paced request should succeed").status, 200);
    }
}

fn child(url: &str, interval: &str, state: &std::path::Path) -> Command {
    let mut command = Command::new(std::env::current_exe().expect("test binary path"));
    command
        .args(["--exact", "child_request"])
        .env(CHILD_URL_ENV, url)
        .env(REQUEST_INTERVAL_ENV, interval)
        .env(STATE_DIR_ENV, state)
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    command
}

#[test]
fn concurrent_processes_share_one_paced_gate() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("test listener should bind");
    let url = format!(
        "http://{}/api",
        listener.local_addr().expect("listener address")
    );
    let server = thread::spawn(move || {
        let mut arrivals = Vec::new();
        for _ in 0..PROCESSES {
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
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}"
            )
            .expect("response should be writable");
        }
        arrivals
    });

    let state = tempfile::tempdir().expect("state directory should be created");
    let interval = INTERVAL.as_millis().to_string();
    let children = (0..PROCESSES)
        .map(|_| {
            child(&url, &interval, state.path())
                .spawn()
                .expect("child process should start")
        })
        .collect::<Vec<_>>();
    for mut child in children {
        assert!(child.wait().expect("child should exit").success());
    }

    let arrivals = server.join().expect("test server should finish");
    for pair in arrivals.windows(2) {
        assert!(
            pair[1] - pair[0] >= INTERVAL,
            "requests arrived {:?} apart",
            pair[1] - pair[0]
        );
    }
}

#[test]
fn an_invalid_environment_interval_is_rejected_before_any_request() {
    let state = tempfile::tempdir().expect("state directory should be created");
    for interval in ["abc", "-1", "60001", "1.5"] {
        let status = child("invalid-interval", interval, state.path())
            .status()
            .expect("child process should run");
        assert!(status.success(), "{interval:?} should be rejected");
    }
}
