//! Cross-process request pacing for KASB traffic.
//!
//! Every paced request waits a cooldown while holding an OS file lock in a
//! per-user state directory, then keeps the lock until its response body is
//! read. The lock file stores the cooldown the next request must wait. Every
//! request waits at least its own interval under the lock regardless of the
//! clock, so slow connection setup, cancellation, process death, and
//! wall-clock changes cannot release a burst. Only the part of a recorded
//! cooldown above that interval (a stricter process or a provider
//! `Retry-After`) ages with wall time, so a back-off does not delay a request
//! made long after it ended.

use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use fs2::FileExt;
use tokio_util::sync::CancellationToken;

/// Built-in interval between KASB requests. A project decision: KASB
/// publishes no rate limit.
pub const DEFAULT_REQUEST_INTERVAL: Duration = Duration::from_millis(500);
/// Largest accepted interval, and the cap applied to provider `Retry-After`.
pub const MAX_REQUEST_INTERVAL: Duration = Duration::from_secs(60);
/// Environment variable consulted when no explicit interval is configured.
pub const REQUEST_INTERVAL_ENV: &str = "KASB_REQUEST_INTERVAL_MS";
/// Environment variable overriding the shared pacing state directory.
pub const STATE_DIR_ENV: &str = "KASB_STATE_DIR";

const LOCK_FILE: &str = "request-pacing-v1.lock";
const LOCK_POLL: Duration = Duration::from_millis(25);
const RECORD_LENGTH: u64 = 16;
/// Longest wait for a lock another process holds. A healthy holder releases
/// within one cooldown plus one request deadline; this bound also covers a
/// queue of waiters while still surfacing a stalled holder as an error.
const LOCK_WAIT_LIMIT: Duration = Duration::from_secs(300);

/// Where the effective request interval came from.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RequestIntervalSource {
    /// An SDK option or CLI flag.
    Explicit,
    /// [`REQUEST_INTERVAL_ENV`].
    Environment,
    /// [`DEFAULT_REQUEST_INTERVAL`].
    Default,
}

/// The pacing policy a request will use.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EffectivePacing {
    pub interval: Duration,
    pub source: RequestIntervalSource,
    /// Shared lock file; `None` when pacing is disabled by a zero interval.
    pub lock_path: Option<PathBuf>,
}

#[derive(Clone, Debug, Eq, PartialEq, thiserror::Error)]
pub enum PacingError {
    #[error("{message}")]
    InvalidSetting {
        setting: &'static str,
        message: String,
    },
    #[error("request pacing state failed: {0}")]
    State(String),
    #[error("another KASB process held the request pacing lock for too long")]
    LockTimeout,
}

/// Parses a millisecond interval in `0..=60000`, rejecting signs, spaces, and
/// fractions instead of falling back to the default.
pub fn parse_request_interval_ms(value: &str) -> Option<Duration> {
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    value
        .parse::<u64>()
        .ok()
        .map(Duration::from_millis)
        .filter(|interval| *interval <= MAX_REQUEST_INTERVAL)
}

/// Resolves the effective policy. Precedence: explicit option, then
/// [`REQUEST_INTERVAL_ENV`], then [`DEFAULT_REQUEST_INTERVAL`]; the state
/// directory likewise prefers the option, then [`STATE_DIR_ENV`], then the
/// per-user state directory.
pub fn resolve_pacing(
    interval: Option<Duration>,
    state_dir: Option<&Path>,
) -> Result<EffectivePacing, PacingError> {
    let (interval, source) = match interval {
        Some(interval) => (interval, RequestIntervalSource::Explicit),
        None => match std::env::var(REQUEST_INTERVAL_ENV) {
            Ok(value) => (
                parse_request_interval_ms(&value).ok_or_else(invalid_interval_setting)?,
                RequestIntervalSource::Environment,
            ),
            Err(std::env::VarError::NotPresent) => {
                (DEFAULT_REQUEST_INTERVAL, RequestIntervalSource::Default)
            }
            Err(std::env::VarError::NotUnicode(_)) => return Err(invalid_interval_setting()),
        },
    };
    if interval > MAX_REQUEST_INTERVAL {
        return Err(invalid_interval_setting());
    }
    // A zero interval never touches shared state, so controlled runs need no
    // writable state directory.
    let lock_path = if interval.is_zero() {
        None
    } else {
        let directory = match state_dir {
            Some(directory) => directory.to_path_buf(),
            None => match std::env::var_os(STATE_DIR_ENV).filter(|value| !value.is_empty()) {
                Some(directory) => PathBuf::from(directory),
                None => default_state_directory().ok_or_else(|| {
                    PacingError::State(format!(
                        "no per-user state directory is available; set {STATE_DIR_ENV}"
                    ))
                })?,
            },
        };
        if !directory.is_absolute() {
            return Err(PacingError::InvalidSetting {
                setting: STATE_DIR_ENV,
                message: format!("{STATE_DIR_ENV} must be an absolute directory path."),
            });
        }
        Some(directory.join(LOCK_FILE))
    };
    Ok(EffectivePacing {
        interval,
        source,
        lock_path,
    })
}

fn invalid_interval_setting() -> PacingError {
    PacingError::InvalidSetting {
        setting: REQUEST_INTERVAL_ENV,
        message: format!(
            "{REQUEST_INTERVAL_ENV} must be an integer from 0 through {}; use 0 only for controlled test runs.",
            MAX_REQUEST_INTERVAL.as_millis()
        ),
    }
}

fn default_state_directory() -> Option<PathBuf> {
    let non_empty = |name| std::env::var_os(name).filter(|value| !value.is_empty());
    if cfg!(windows) {
        non_empty("LOCALAPPDATA").map(|root| PathBuf::from(root).join("kasb").join("state"))
    } else if cfg!(target_os = "macos") {
        non_empty("HOME").map(|root| PathBuf::from(root).join("Library/Application Support/kasb"))
    } else {
        non_empty("XDG_STATE_HOME")
            .map(PathBuf::from)
            .filter(|root| root.is_absolute())
            .map(|root| root.join("kasb"))
            .or_else(|| non_empty("HOME").map(|root| PathBuf::from(root).join(".local/state/kasb")))
    }
}

/// Holds the shared pacing lock for one request. Dropping it, including on
/// cancellation or process exit, releases the OS lock.
pub(crate) struct PacingPermit {
    file: File,
}

impl PacingPermit {
    /// Extends the cooldown before the next request, for every process sharing
    /// the state, when the provider asks callers to back off.
    pub(crate) async fn extend_cooldown(self, cooldown: Duration) -> Result<(), PacingError> {
        let cooldown = cooldown.min(MAX_REQUEST_INTERVAL);
        let mut file = self.file;
        tokio::task::spawn_blocking(move || {
            let remaining = read_record(&mut file)?.map_or(Duration::ZERO, Record::remaining);
            write_record(&mut file, remaining.max(cooldown))
        })
        .await
        .map_err(|_| worker_failed())?
        .map_err(state_io_error)
    }
}

pub(crate) enum PacingOutcome {
    Ready(Option<PacingPermit>),
    Cancelled,
}

enum Attempt {
    Ready(File, Duration),
    Contended,
}

/// Waits for this request's turn. Returns no permit when pacing is disabled.
pub(crate) async fn acquire(
    pacing: &EffectivePacing,
    cancellation: &CancellationToken,
) -> Result<PacingOutcome, PacingError> {
    acquire_within(pacing, cancellation, LOCK_WAIT_LIMIT).await
}

async fn acquire_within(
    pacing: &EffectivePacing,
    cancellation: &CancellationToken,
    lock_wait_limit: Duration,
) -> Result<PacingOutcome, PacingError> {
    let Some(path) = &pacing.lock_path else {
        return Ok(PacingOutcome::Ready(None));
    };
    let started = tokio::time::Instant::now();
    loop {
        let path = path.clone();
        let interval = pacing.interval;
        // File operations stay off the async executor; no worker blocks on
        // another process's lock.
        let attempt = tokio::task::spawn_blocking(move || try_acquire(&path, interval))
            .await
            .map_err(|_| worker_failed())?
            .map_err(state_io_error)?;
        match attempt {
            Attempt::Ready(mut file, delay) => {
                // Wait under the lock. Cancellation drops the file, releasing
                // the lock with the longer cooldown still recorded.
                tokio::select! {
                    biased;
                    _ = cancellation.cancelled() => return Ok(PacingOutcome::Cancelled),
                    _ = tokio::time::sleep(delay) => {}
                }
                let file = tokio::task::spawn_blocking(move || {
                    write_record(&mut file, interval)?;
                    Ok::<_, std::io::Error>(file)
                })
                .await
                .map_err(|_| worker_failed())?
                .map_err(state_io_error)?;
                return Ok(PacingOutcome::Ready(Some(PacingPermit { file })));
            }
            Attempt::Contended => {
                if started.elapsed() >= lock_wait_limit {
                    return Err(PacingError::LockTimeout);
                }
                tokio::select! {
                    biased;
                    _ = cancellation.cancelled() => return Ok(PacingOutcome::Cancelled),
                    _ = tokio::time::sleep(LOCK_POLL) => {}
                }
            }
        }
    }
}

fn try_acquire(path: &Path, interval: Duration) -> std::io::Result<Attempt> {
    std::fs::create_dir_all(path.parent().expect("pacing lock has a parent directory"))?;
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(path)?;
    match FileExt::try_lock_exclusive(&file) {
        Ok(()) => {}
        Err(error) if error.raw_os_error() == fs2::lock_contended_error().raw_os_error() => {
            return Ok(Attempt::Contended);
        }
        Err(error) => return Err(error),
    }
    // Honor the larger of this caller's interval and the recorded cooldown,
    // which may come from a stricter process or a provider `Retry-After`.
    let delay =
        read_record(&mut file)?.map_or(interval, |recorded| recorded.remaining().max(interval));
    // Record the longer cooldown before waiting in case this caller is
    // cancelled. Never unlink or replace the file: every process must lock the
    // same inode.
    write_record(&mut file, delay)?;
    Ok(Attempt::Ready(file, delay))
}

struct Record {
    cooldown: Duration,
    written_at: Duration,
}

impl Record {
    /// The cooldown still owed after wall time since it was written. A clock
    /// that moved backwards ages nothing.
    fn remaining(self) -> Duration {
        let elapsed = unix_now().saturating_sub(self.written_at);
        self.cooldown.saturating_sub(elapsed)
    }
}

fn unix_now() -> Duration {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
}

fn read_record(file: &mut File) -> std::io::Result<Option<Record>> {
    let length = file.metadata()?.len();
    if length == 0 {
        return Ok(None);
    }
    if length != RECORD_LENGTH {
        return Err(std::io::Error::other("invalid pacing record length"));
    }
    let mut record = [0; RECORD_LENGTH as usize];
    file.seek(SeekFrom::Start(0))?;
    file.read_exact(&mut record)?;
    let (cooldown, written_at) = record.split_at(8);
    let milliseconds = |bytes: &[u8]| {
        Duration::from_millis(u64::from_le_bytes(bytes.try_into().expect("8 bytes")))
    };
    let cooldown = milliseconds(cooldown);
    if cooldown > MAX_REQUEST_INTERVAL {
        return Err(std::io::Error::other("invalid pacing interval record"));
    }
    Ok(Some(Record {
        cooldown,
        written_at: milliseconds(written_at),
    }))
}

/// Records the cooldown owed from now.
fn write_record(file: &mut File, cooldown: Duration) -> std::io::Result<()> {
    let milliseconds = |duration: Duration| {
        u64::try_from(duration.as_millis())
            .unwrap_or(u64::MAX)
            .to_le_bytes()
    };
    file.seek(SeekFrom::Start(0))?;
    file.write_all(&milliseconds(cooldown))?;
    file.write_all(&milliseconds(unix_now()))?;
    file.flush()
}

fn worker_failed() -> PacingError {
    PacingError::State("the pacing worker failed".to_owned())
}

fn state_io_error(error: std::io::Error) -> PacingError {
    PacingError::State(error.to_string())
}

#[cfg(test)]
mod tests {
    use tokio::time::Instant;

    use super::*;

    fn paced(directory: &Path, milliseconds: u64) -> EffectivePacing {
        resolve_pacing(Some(Duration::from_millis(milliseconds)), Some(directory))
            .expect("explicit pacing resolves")
    }

    async fn permit(pacing: &EffectivePacing) -> PacingPermit {
        match acquire(pacing, &CancellationToken::new()).await.unwrap() {
            PacingOutcome::Ready(Some(permit)) => permit,
            _ => panic!("expected a pacing permit"),
        }
    }

    #[test]
    fn interval_parsing_is_bounded_and_strict() {
        for value in [
            "",
            "-1",
            "+1",
            " 500",
            "500 ",
            "1.5",
            "60001",
            "18446744073709551616",
        ] {
            assert_eq!(parse_request_interval_ms(value), None, "{value:?}");
        }
        assert_eq!(parse_request_interval_ms("0"), Some(Duration::ZERO));
        assert_eq!(
            parse_request_interval_ms("60000"),
            Some(MAX_REQUEST_INTERVAL)
        );
    }

    #[test]
    fn explicit_settings_are_validated_and_zero_disables_state() {
        let relative = resolve_pacing(Some(DEFAULT_REQUEST_INTERVAL), Some(Path::new("state")));
        assert!(matches!(
            relative,
            Err(PacingError::InvalidSetting {
                setting: STATE_DIR_ENV,
                ..
            })
        ));
        let too_long = resolve_pacing(Some(MAX_REQUEST_INTERVAL + Duration::from_millis(1)), None);
        assert!(matches!(
            too_long,
            Err(PacingError::InvalidSetting {
                setting: REQUEST_INTERVAL_ENV,
                ..
            })
        ));
        let disabled = resolve_pacing(Some(Duration::ZERO), Some(Path::new("state"))).unwrap();
        assert_eq!(disabled.lock_path, None);
        assert_eq!(disabled.source, RequestIntervalSource::Explicit);
    }

    #[tokio::test]
    async fn a_long_held_or_cancelled_permit_does_not_expire_the_next_cooldown() {
        let directory = tempfile::tempdir().unwrap();
        let pacing = paced(directory.path(), 100);

        let held = permit(&pacing).await;
        tokio::time::sleep(Duration::from_millis(200)).await;
        drop(held);
        let released = Instant::now();
        drop(permit(&pacing).await);
        assert!(released.elapsed() >= Duration::from_millis(100));

        let cancellation = CancellationToken::new();
        let waiting = {
            let pacing = pacing.clone();
            let cancellation = cancellation.clone();
            tokio::spawn(async move { acquire(&pacing, &cancellation).await })
        };
        tokio::time::sleep(Duration::from_millis(25)).await;
        cancellation.cancel();
        assert!(matches!(
            waiting.await.unwrap().unwrap(),
            PacingOutcome::Cancelled
        ));
        let cancelled = Instant::now();
        drop(permit(&pacing).await);
        assert!(cancelled.elapsed() >= Duration::from_millis(100));
    }

    #[tokio::test]
    async fn the_larger_interval_and_retry_after_cooldowns_are_honored() {
        let directory = tempfile::tempdir().unwrap();
        let strict = paced(directory.path(), 300);
        let loose = paced(directory.path(), 10);

        // The recorded cooldown ages from its write, a moment before each
        // measurement starts, so the bounds leave a small margin.
        drop(permit(&strict).await);
        let started = Instant::now();
        drop(permit(&loose).await);
        assert!(started.elapsed() >= Duration::from_millis(270));

        permit(&loose)
            .await
            .extend_cooldown(Duration::from_millis(250))
            .await
            .unwrap();
        let started = Instant::now();
        drop(permit(&loose).await);
        assert!(started.elapsed() >= Duration::from_millis(220));
    }

    #[tokio::test]
    async fn a_back_off_ages_out_but_the_callers_own_interval_never_does() {
        let directory = tempfile::tempdir().unwrap();
        let pacing = paced(directory.path(), 50);

        permit(&pacing)
            .await
            .extend_cooldown(Duration::from_millis(400))
            .await
            .unwrap();
        tokio::time::sleep(Duration::from_millis(500)).await;
        let started = Instant::now();
        drop(permit(&pacing).await);
        let waited = started.elapsed();
        assert!(waited >= Duration::from_millis(50));
        assert!(waited < Duration::from_millis(300), "waited {waited:?}");
    }

    #[tokio::test]
    async fn a_stalled_lock_holder_becomes_an_error_instead_of_an_endless_wait() {
        let directory = tempfile::tempdir().unwrap();
        let pacing = paced(directory.path(), 10);
        let held = permit(&pacing).await;

        let result = acquire_within(
            &pacing,
            &CancellationToken::new(),
            Duration::from_millis(100),
        )
        .await;
        assert!(matches!(result, Err(PacingError::LockTimeout)));
        drop(held);
        drop(permit(&pacing).await);
    }

    #[tokio::test]
    async fn damaged_state_fails_closed() {
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(directory.path().join(LOCK_FILE), b"bad").unwrap();
        let result = acquire(&paced(directory.path(), 10), &CancellationToken::new()).await;
        assert!(matches!(result, Err(PacingError::State(_))));
    }
}
