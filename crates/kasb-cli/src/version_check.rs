//! CLI-local release evidence. Cached observations never authorize replacement.
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use kasb::http::CancellationToken;
use semver::Version;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::release::{self, GithubReleaseSource, Release, ReleaseManifest, TargetIdentity};
use crate::render::ProcessOutput;
use crate::version_cache::{self, CacheRecord};

pub(crate) const VERSION: &str = env!("CARGO_PKG_VERSION");
pub(crate) const TTL: u64 = 6 * 60 * 60;
pub(crate) const COOLDOWN: u64 = 15 * 60;
pub(crate) const INCIDENTAL_BUDGET: Duration = Duration::from_secs(2);
const EXPLICIT_BUDGET: Duration = Duration::from_secs(5);

#[derive(Clone)]
pub(crate) struct LocalBudget {
    pub(crate) deadline: tokio::time::Instant,
    cancellation: CancellationToken,
}

impl LocalBudget {
    pub(crate) fn new(deadline: tokio::time::Instant, cancellation: CancellationToken) -> Self {
        Self {
            deadline,
            cancellation,
        }
    }
    pub(crate) fn active(&self) -> bool {
        !self.cancellation.is_cancelled() && tokio::time::Instant::now() < self.deadline
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Problem {
    RefreshFailed,
    RefreshTimedOut,
    RefreshInProgress,
    CacheUnavailable,
    CacheInvalid,
    InspectionFailed,
    InspectionTimedOut,
    ClockInvalid,
    UncomparableIdentity,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum Comparison {
    Newer,
    Equal,
    Ahead,
    NoStableRelease,
    Uncomparable,
    Unavailable,
}

#[derive(Debug, Serialize)]
#[serde(tag = "freshness", rename_all = "camelCase")]
enum Freshness {
    Fresh {
        #[serde(rename = "observedAt")]
        observed_at: u64,
        #[serde(rename = "ageSeconds")]
        age_seconds: u64,
    },
    Stale {
        #[serde(rename = "observedAt")]
        observed_at: u64,
        #[serde(rename = "ageSeconds")]
        age_seconds: u64,
    },
    Unavailable,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "camelCase", deny_unknown_fields)]
pub(crate) enum Distribution {
    Ready,
    Incomplete { problems: Vec<DistributionProblem> },
    Unsupported,
    Unknown,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "code", rename_all = "camelCase", deny_unknown_fields)]
pub(crate) enum DistributionProblem {
    MutableRelease,
    Asset { name: String, reason: AssetProblem },
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AssetProblem {
    Missing,
    Duplicate,
    InvalidUrl,
    InvalidSize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SelectedRelease {
    pub(crate) version: String,
    pub(crate) tag: String,
    pub(crate) url: String,
    pub(crate) repository: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) target: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Observation {
    pub(crate) observed_at: u64,
    pub(crate) release: Option<SelectedRelease>,
    pub(crate) distribution: Distribution,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Owner {
    Standalone,
    Npm,
    Cargo,
    Unknown,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Installation {
    owner: Owner,
    verified: bool,
    next_action: NextAction,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
enum NextAction {
    UpgradeWithKasb,
    ConsultNpmOwner,
    RebuildWithCargo,
    InspectInstallationOwner,
    InspectRelease,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Report {
    current_version: &'static str,
    comparison: Comparison,
    #[serde(flatten)]
    freshness: Freshness,
    #[serde(skip_serializing_if = "Option::is_none")]
    release: Option<SelectedRelease>,
    distribution: Distribution,
    installation: Installation,
    problems: Vec<Problem>,
}

impl Report {
    pub(crate) fn incidental(&self) -> bool {
        !matches!(
            self.comparison,
            Comparison::Equal | Comparison::Ahead | Comparison::NoStableRelease
        ) || !matches!(self.freshness, Freshness::Fresh { .. })
            || !self.problems.is_empty()
            || matches!(
                self.distribution,
                Distribution::Incomplete { .. } | Distribution::Unsupported
            )
    }
}

pub(crate) fn opted_out(flag: bool) -> bool {
    flag || std::env::var_os("KASB_NO_VERSION_CHECK").is_some_and(|value| value == "1")
}

pub(crate) async fn run(
    refresh: bool,
    pretty: bool,
    cancellation: &CancellationToken,
) -> ProcessOutput {
    match evaluate(refresh, EXPLICIT_BUDGET, cancellation).await {
        None => ProcessOutput::interrupted(130),
        Some(report) => {
            let value = json!({"result": {"versionCheck": report}, "metadata": {"cliTransportVersion": "1", "operation": "version-check"}, "references": {}, "warnings": []});
            ProcessOutput::success(if pretty {
                serde_json::to_string_pretty(&value).expect("JSON report")
            } else {
                value.to_string()
            })
        }
    }
}

pub(crate) async fn evaluate(
    refresh: bool,
    budget: Duration,
    cancellation: &CancellationToken,
) -> Option<Report> {
    let mut state = Evaluation::new();
    let deadline = tokio::time::Instant::now() + budget;
    let work_cancellation = cancellation.child_token();
    let _cancel_workers = work_cancellation.clone().drop_guard();
    let budget = LocalBudget::new(deadline, work_cancellation);
    tokio::select! {
        biased;
        _ = cancellation.cancelled() => return None,
        _ = termination_signal() => return None,
        result = tokio::time::timeout_at(deadline, state.collect(refresh, &budget)) => {
            if result.is_err() { state.problems.push(state.phase); if state.phase == Problem::RefreshTimedOut { state.failed = true; } }
        }
    }
    Some(state.report())
}

struct Evaluation {
    observation: Option<Observation>,
    owner: Owner,
    problems: Vec<Problem>,
    failed: bool,
    phase: Problem,
}

impl Evaluation {
    fn new() -> Self {
        Self {
            observation: None,
            owner: Owner::Unknown,
            problems: Vec::new(),
            failed: false,
            phase: Problem::CacheUnavailable,
        }
    }

    async fn collect(&mut self, refresh: bool, budget: &LocalBudget) {
        let Ok(manifest) = release::release_manifest() else {
            self.problems.push(Problem::InspectionFailed);
            return;
        };
        let target = release::current_target(&manifest).ok();
        let key = version_cache::key(&manifest, target.as_ref());
        let now = now_seconds();
        let Some(now) = now else {
            self.problems.push(Problem::ClockInvalid);
            return;
        };
        // Disk access and executable hashing run outside the async executor. Each
        // worker checks the shared deadline between bounded operations.
        let cache_key = key.clone();
        let disk_budget = budget.clone();
        let loaded =
            tokio::task::spawn_blocking(move || version_cache::load(&cache_key, &disk_budget))
                .await;
        let mut record = match loaded {
            Ok(Ok(record))
                if record.valid(&manifest, target.as_ref(), now_seconds().unwrap_or(now)) =>
            {
                record
            }
            Ok(Ok(_)) => {
                self.problems.push(Problem::CacheInvalid);
                CacheRecord::empty(key.clone())
            }
            Ok(Err(problem)) => {
                self.problems.push(problem);
                CacheRecord::empty(key.clone())
            }
            Err(_) => {
                self.problems.push(Problem::CacheUnavailable);
                CacheRecord::empty(key.clone())
            }
        };
        self.observation = record.observation.clone();
        self.failed = record.failed_at.is_some();
        let fresh = record
            .observation
            .as_ref()
            .is_some_and(|o| now.checked_sub(o.observed_at).is_some_and(|age| age < TTL));
        let cooling = record
            .failed_at
            .is_some_and(|time| now.checked_sub(time).is_some_and(|age| age < COOLDOWN));
        if refresh || (!fresh || self.failed) && !cooling {
            self.failed = true;
            let lock_key = key.clone();
            let disk_budget = budget.clone();
            match tokio::task::spawn_blocking(move || version_cache::lock(&lock_key, &disk_budget))
                .await
            {
                Ok(Ok(Some(lock))) => {
                    // The lock lives across the awaited refresh; losers never wait or fetch.
                    let disk_budget = budget.clone();
                    let reloaded = tokio::task::spawn_blocking(move || {
                        let record = version_cache::reload(&lock, &disk_budget);
                        (lock, record)
                    })
                    .await;
                    let Ok((lock, reloaded)) = reloaded else {
                        self.problems.push(Problem::CacheUnavailable);
                        return;
                    };
                    if let Ok(latest) = reloaded
                        && latest.valid(&manifest, target.as_ref(), now_seconds().unwrap_or(now))
                    {
                        record = latest;
                        self.observation = record.observation.clone();
                        self.failed = record.failed_at.is_some();
                    }
                    let now = now_seconds().unwrap_or(now);
                    let already_refreshed = record.observation.as_ref().is_some_and(|o| {
                        now.checked_sub(o.observed_at).is_some_and(|age| age < TTL)
                    }) && record.failed_at.is_none();
                    let already_failed = record.failed_at.is_some_and(|time| {
                        now.checked_sub(time).is_some_and(|age| age < COOLDOWN)
                    });
                    if !refresh && (already_refreshed || already_failed) {
                        if already_failed {
                            self.problems.push(Problem::RefreshFailed);
                        }
                        drop(lock);
                        self.inspect(manifest, budget).await;
                        return;
                    }
                    self.refresh(&manifest, target.as_ref(), budget).await;
                    record.observation = self.observation.clone();
                    record.failed_at = if self.failed { now_seconds() } else { None };
                    self.phase = Problem::CacheUnavailable;
                    let disk_budget = budget.clone();
                    let saved = tokio::task::spawn_blocking(move || {
                        let result = version_cache::save(&record, &lock, &disk_budget);
                        drop(lock);
                        result
                    })
                    .await;
                    if !matches!(saved, Ok(Ok(()))) {
                        self.problems.push(Problem::CacheUnavailable);
                    }
                }
                Ok(Ok(None)) => {
                    self.problems.push(Problem::RefreshInProgress);
                    self.failed = true;
                }
                Ok(Err(problem)) => {
                    self.problems.push(problem);
                    self.refresh(&manifest, target.as_ref(), budget).await;
                }
                Err(_) => {
                    self.problems.push(Problem::CacheUnavailable);
                    self.refresh(&manifest, target.as_ref(), budget).await;
                }
            }
        } else if cooling {
            self.problems.push(Problem::RefreshFailed);
        }
        self.inspect(manifest, budget).await;
    }

    async fn refresh(
        &mut self,
        manifest: &ReleaseManifest,
        target: Option<&TargetIdentity>,
        budget: &LocalBudget,
    ) {
        self.phase = Problem::RefreshTimedOut;
        self.failed = true;
        // Reserve part of the shared budget for the failed-attempt cooldown.
        let remaining = budget
            .deadline
            .saturating_duration_since(tokio::time::Instant::now())
            .saturating_sub(Duration::from_millis(100));
        let refreshed = tokio::time::timeout(remaining, async {
            let source = GithubReleaseSource::new(&manifest.release)?;
            source.discover().await
        })
        .await;
        match refreshed {
            Ok(Ok(release)) => match now_seconds() {
                Some(time) => {
                    self.observation = Some(observation(release.as_ref(), manifest, target, time));
                    self.failed = false;
                }
                None => self.problems.push(Problem::ClockInvalid),
            },
            Ok(Err(_)) => self.problems.push(Problem::RefreshFailed),
            Err(_) => self.problems.push(Problem::RefreshTimedOut),
        }
    }

    async fn inspect(&mut self, inspection_manifest: ReleaseManifest, budget: &LocalBudget) {
        self.phase = Problem::InspectionTimedOut;
        let disk_budget = budget.clone();
        let inspected = tokio::task::spawn_blocking(move || {
            crate::upgrade::inspect_owner(&inspection_manifest, &disk_budget)
        })
        .await;
        match inspected {
            Ok(Ok(owner)) => self.owner = owner,
            Ok(Err(problem)) => self.problems.push(problem),
            Err(_) => self.problems.push(Problem::InspectionFailed),
        }
    }

    fn report(mut self) -> Report {
        let now = now_seconds();
        let (release, distribution, freshness) = match self.observation {
            Some(observation) => {
                let age = now.and_then(|time| time.checked_sub(observation.observed_at));
                let fresh = !self.failed && age.is_some_and(|age| age < TTL);
                if age.is_none() {
                    self.problems.push(Problem::ClockInvalid);
                }
                let freshness = if fresh {
                    Freshness::Fresh {
                        observed_at: observation.observed_at,
                        age_seconds: age.unwrap_or(0),
                    }
                } else {
                    Freshness::Stale {
                        observed_at: observation.observed_at,
                        age_seconds: age.unwrap_or(0),
                    }
                };
                (observation.release, observation.distribution, freshness)
            }
            None => (None, Distribution::Unknown, Freshness::Unavailable),
        };
        let comparison = compare(
            VERSION,
            release.as_ref().map(|r| r.version.as_str()),
            !matches!(freshness, Freshness::Unavailable),
        );
        if comparison == Comparison::Uncomparable {
            self.problems.push(Problem::UncomparableIdentity);
        }
        let next_action = match self.owner {
            Owner::Standalone
                if comparison == Comparison::Newer
                    && distribution == Distribution::Ready
                    && matches!(freshness, Freshness::Fresh { .. }) =>
            {
                NextAction::UpgradeWithKasb
            }
            Owner::Standalone => NextAction::InspectRelease,
            Owner::Npm => NextAction::ConsultNpmOwner,
            Owner::Cargo => NextAction::RebuildWithCargo,
            Owner::Unknown => NextAction::InspectInstallationOwner,
        };
        self.problems.sort_unstable();
        self.problems.dedup();
        Report {
            current_version: VERSION,
            comparison,
            freshness,
            release,
            distribution,
            installation: Installation {
                owner: self.owner,
                verified: self.owner == Owner::Standalone,
                next_action,
            },
            problems: self.problems,
        }
    }
}

fn compare(current: &str, release: Option<&str>, observed: bool) -> Comparison {
    let Ok(current) = Version::parse(current) else {
        return Comparison::Uncomparable;
    };
    if !current.pre.is_empty() || !current.build.is_empty() {
        return Comparison::Uncomparable;
    }
    if !observed {
        return Comparison::Unavailable;
    }
    let Some(release) = release else {
        return Comparison::NoStableRelease;
    };
    let Ok(release) = Version::parse(release) else {
        return Comparison::Unavailable;
    };
    match current.cmp(&release) {
        std::cmp::Ordering::Less => Comparison::Newer,
        std::cmp::Ordering::Equal => Comparison::Equal,
        std::cmp::Ordering::Greater => Comparison::Ahead,
    }
}

fn observation(
    release: Option<&Release>,
    manifest: &ReleaseManifest,
    target: Option<&TargetIdentity>,
    now: u64,
) -> Observation {
    let Some(release) = release else {
        return Observation {
            observed_at: now,
            release: None,
            distribution: Distribution::Unknown,
        };
    };
    let version = release::release_version(&release.tag_name, &manifest.release.tag_prefix)
        .expect("discovery validates stable identity");
    let selected = SelectedRelease {
        version: version.to_string(),
        tag: release.tag_name.clone(),
        url: format!(
            "https://github.com/{}/releases/tag/{}",
            manifest.release.repository, release.tag_name
        ),
        repository: manifest.release.repository.clone(),
        target: target.map(|t| t.release_target.clone()),
    };
    let distribution = match target {
        None => Distribution::Unsupported,
        Some(target) => {
            let mut problems = Vec::new();
            if !release.immutable {
                problems.push(DistributionProblem::MutableRelease);
            }
            let policy = &manifest.release;
            let archive = release::archive_name(policy, &version, &target.release_target);
            let installer = if target.executable_name.ends_with(".exe") {
                &policy.powershell_installer_asset
            } else {
                &policy.shell_installer_asset
            };
            for (name, limit) in [
                (archive.as_str(), policy.archive_limit_bytes),
                (policy.checksum_asset.as_str(), policy.metadata_limit_bytes),
                (installer.as_str(), policy.metadata_limit_bytes),
            ] {
                let mut matches = release.assets.iter().filter(|asset| asset.name == name);
                let problem = match (matches.next(), matches.next()) {
                    (None, _) => Some(AssetProblem::Missing),
                    (Some(_), Some(_)) => Some(AssetProblem::Duplicate),
                    (Some(asset), None)
                        if release::validate_download_url(asset, &release.tag_name, policy)
                            .is_err() =>
                    {
                        Some(AssetProblem::InvalidUrl)
                    }
                    (Some(asset), None) if asset.size == 0 || asset.size > limit as u64 => {
                        Some(AssetProblem::InvalidSize)
                    }
                    _ => None,
                };
                if let Some(reason) = problem {
                    problems.push(DistributionProblem::Asset {
                        name: name.to_owned(),
                        reason,
                    });
                }
            }
            if problems.is_empty() {
                Distribution::Ready
            } else {
                Distribution::Incomplete { problems }
            }
        }
    };
    Observation {
        observed_at: now,
        release: Some(selected),
        distribution,
    }
}

pub(crate) fn now_seconds() -> Option<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_secs())
}

async fn termination_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};
        match (
            signal(SignalKind::interrupt()),
            signal(SignalKind::terminate()),
        ) {
            (Ok(mut interrupt), Ok(mut terminate)) => {
                tokio::select! { _ = interrupt.recv() => {}, _ = terminate.recv() => {} }
            }
            _ => std::future::pending::<()>().await,
        }
    }
    #[cfg(not(unix))]
    {
        if tokio::signal::ctrl_c().await.is_err() {
            std::future::pending::<()>().await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn comparison_uses_running_identity_and_keeps_absence_separate() {
        for (current, selected, observed, expected) in [
            ("0.3.3", Some("0.4.0"), true, Comparison::Newer),
            ("0.4.0", Some("0.4.0"), true, Comparison::Equal),
            ("0.5.0", Some("0.4.0"), true, Comparison::Ahead),
            ("0.4.0-rc.1", Some("0.4.0"), true, Comparison::Uncomparable),
            ("0.4.0+dev", None, false, Comparison::Uncomparable),
            ("development", None, false, Comparison::Uncomparable),
            ("0.4.0", None, true, Comparison::NoStableRelease),
            ("0.4.0", None, false, Comparison::Unavailable),
        ] {
            assert_eq!(compare(current, selected, observed), expected);
        }
    }

    #[test]
    fn readiness_exposes_each_missing_or_untrusted_asset_without_downloading() {
        let manifest = release::release_manifest().unwrap();
        let target = release::current_target(&manifest).unwrap();
        let releases: Vec<Release> = serde_json::from_str(include_str!(
            "../../../fixtures/version-check/releases.json"
        ))
        .unwrap();
        let ready = releases[1].clone();
        assert_eq!(
            observation(Some(&ready), &manifest, Some(&target), 1).distribution,
            Distribution::Ready
        );
        assert_eq!(
            observation(Some(&ready), &manifest, None, 1).distribution,
            Distribution::Unsupported
        );
        for corrupt in 0..5 {
            let mut release = ready.clone();
            match corrupt {
                0 => release.assets.clear(),
                1 => release.immutable = false,
                2 => release.assets.extend(ready.assets.clone()),
                3 => {
                    for asset in &mut release.assets {
                        asset.browser_download_url = "https://evil.example/archive".into();
                    }
                }
                _ => {
                    for asset in &mut release.assets {
                        asset.size = u64::MAX;
                    }
                }
            }
            assert!(matches!(
                observation(Some(&release), &manifest, Some(&target), 1).distribution,
                Distribution::Incomplete { .. }
            ));
        }
    }

    #[test]
    fn failed_refresh_retains_original_observation_and_truthful_age() {
        let observed_at = now_seconds().unwrap() - 100;
        let state = Evaluation {
            observation: Some(Observation {
                observed_at,
                release: None,
                distribution: Distribution::Unknown,
            }),
            owner: Owner::Unknown,
            problems: vec![Problem::RefreshFailed],
            failed: true,
            phase: Problem::RefreshTimedOut,
        };
        let report = state.report();
        assert!(
            matches!(report.freshness, Freshness::Stale { observed_at: time, age_seconds: age } if time == observed_at && age >= 100)
        );
        assert_eq!(report.comparison, Comparison::NoStableRelease);
        assert!(report.incidental());
        let value = serde_json::to_vec(&report).unwrap();
        assert!(value.len() < 8 * 1024);
    }

    #[tokio::test]
    async fn pre_cancelled_explicit_evidence_is_interrupted() {
        let cancellation = CancellationToken::new();
        cancellation.cancel();
        assert_eq!(
            run(false, false, &cancellation).await,
            ProcessOutput::interrupted(130)
        );
    }
}
