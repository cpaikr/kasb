use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[cfg(test)]
use std::sync::atomic::{AtomicUsize, Ordering};

use flate2::read::GzDecoder;
use futures_util::StreamExt;
use semver::Version;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use wreq::header::{ACCEPT, USER_AGENT};

use crate::render::ProcessOutput;

const VERSION: &str = env!("CARGO_PKG_VERSION");
const MANIFEST_JSON: &str = include_str!("../../../native-targets.json");
const ARCHIVE_EXPANSION_OVERHEAD: u64 = 8 * 1024 * 1024;

#[cfg(test)]
static RELEASE_TRANSPORT_CONSTRUCTIONS: AtomicUsize = AtomicUsize::new(0);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseManifest {
    release: ReleasePolicy,
    targets: Vec<NativeTarget>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReleasePolicy {
    repository: String,
    tag_prefix: String,
    archive_prefix: String,
    archive_extension: String,
    checksum_asset: String,
    receipt_file: String,
    receipt_schema_version: u32,
    metadata_limit_bytes: usize,
    archive_limit_bytes: usize,
    request_timeout_seconds: u64,
    connect_timeout_seconds: u64,
    redirect_limit: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeTarget {
    npm_platform: String,
    npm_arch: String,
    libc: Option<String>,
    package_directory: String,
    cli_file: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Receipt {
    schema_version: u32,
    manager: String,
    version: String,
    target: String,
    executable: PathBuf,
    release_repository: String,
    release_tag: String,
    asset_name: String,
    sha256: String,
}

#[derive(Clone, Debug, Deserialize)]
struct Release {
    tag_name: String,
    immutable: bool,
    draft: bool,
    prerelease: bool,
    assets: Vec<ReleaseAsset>,
}

#[derive(Clone, Debug, Deserialize)]
struct ReleaseAsset {
    name: String,
    browser_download_url: String,
    size: u64,
    digest: Option<String>,
}

#[derive(Debug)]
struct ManagedInstallation {
    executable: PathBuf,
    receipt_path: PathBuf,
}

#[derive(Debug)]
struct UpgradeError {
    code: &'static str,
    message: String,
    retryable: bool,
    recovery: Option<String>,
}

impl UpgradeError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            retryable: false,
            recovery: None,
        }
    }

    fn network(message: impl Into<String>) -> Self {
        Self {
            code: "upgrade_network_failure",
            message: message.into(),
            retryable: true,
            recovery: None,
        }
    }

    fn recovery(mut self, recovery: impl Into<String>) -> Self {
        self.recovery = Some(recovery.into());
        self
    }
}

pub(crate) async fn run(check_only: bool) -> ProcessOutput {
    match run_inner(check_only).await {
        Ok(value) => ProcessOutput::success(value.to_string()),
        Err(error) => failure(error),
    }
}

async fn run_inner(check_only: bool) -> Result<serde_json::Value, UpgradeError> {
    let manifest = release_manifest()?;
    let target = current_target(&manifest)?;
    let completed_replacements = reconcile_deferred_status(&manifest.release)?;
    let installation = managed_installation(&manifest, &target)?;
    if should_clear_completed_replacements(check_only) {
        clear_completed_replacements(completed_replacements)?;
    }
    let source = GithubReleaseSource::new(&manifest.release)?;
    execute_upgrade(check_only, &manifest, target, &installation, &source).await
}

fn should_clear_completed_replacements(check_only: bool) -> bool {
    !check_only
}

trait ReleaseSource {
    async fn latest(&self) -> Result<Release, UpgradeError>;
    async fn download(&self, asset: &ReleaseAsset, limit: usize) -> Result<Vec<u8>, UpgradeError>;
}

async fn execute_upgrade<S: ReleaseSource>(
    check_only: bool,
    manifest: &ReleaseManifest,
    target: TargetIdentity,
    installation: &ManagedInstallation,
    source: &S,
) -> Result<serde_json::Value, UpgradeError> {
    let operation = if check_only {
        "upgrade-check"
    } else {
        "upgrade"
    };
    let release = source.latest().await?;
    validate_release(&release, &manifest.release)?;
    let latest = release_version(&release.tag_name, &manifest.release.tag_prefix)?;
    let current = Version::parse(VERSION).map_err(|_| {
        UpgradeError::new(
            "upgrade_identity_failure",
            "The compiled product version is invalid.",
        )
    })?;
    let available = latest > current;
    if !available {
        return Ok(success(json!({
            "operation": operation,
            "managed": true,
            "currentVersion": VERSION,
            "latestVersion": latest.to_string(),
            "updateAvailable": available,
            "releaseTag": release.tag_name,
            "releaseRepository": manifest.release.repository,
            "target": target.release_target,
        })));
    }

    let archive_name = archive_name(&manifest.release, &latest, &target.release_target);
    let archive_asset = asset(&release, &archive_name)?;
    let checksum_asset = asset(&release, &manifest.release.checksum_asset)?;
    validate_download_url(archive_asset, &release.tag_name, &manifest.release)?;
    validate_download_url(checksum_asset, &release.tag_name, &manifest.release)?;
    if archive_asset.size == 0 || archive_asset.size > manifest.release.archive_limit_bytes as u64 {
        return Err(UpgradeError::new(
            "upgrade_asset_too_large",
            "The release archive exceeds the download limit.",
        ));
    }
    if checksum_asset.size == 0
        || checksum_asset.size > manifest.release.metadata_limit_bytes as u64
    {
        return Err(UpgradeError::new(
            "upgrade_asset_too_large",
            "The release checksum manifest exceeds the download limit.",
        ));
    }
    if check_only {
        return Ok(success(json!({
            "operation": operation,
            "managed": true,
            "currentVersion": VERSION,
            "latestVersion": latest.to_string(),
            "updateAvailable": true,
            "releaseTag": release.tag_name,
            "releaseRepository": manifest.release.repository,
            "target": target.release_target,
        })));
    }
    let checksums = source
        .download(checksum_asset, manifest.release.metadata_limit_bytes)
        .await?;
    if checksums.len() != checksum_asset.size as usize {
        return Err(UpgradeError::new(
            "upgrade_asset_identity",
            "The downloaded checksum manifest size differs from immutable release metadata.",
        ));
    }
    let expected_archive = checksum_entry(&checksums, &archive_name)?;
    let archive = source
        .download(archive_asset, manifest.release.archive_limit_bytes)
        .await?;
    if archive.len() != archive_asset.size as usize {
        return Err(UpgradeError::new(
            "upgrade_asset_identity",
            "The downloaded archive size differs from immutable release metadata.",
        ));
    }
    verify_digest(&archive, &expected_archive, "archive")?;
    verify_metadata_digest(&archive, archive_asset.digest.as_deref(), "GitHub asset")?;
    verify_metadata_digest(
        &checksums,
        checksum_asset.digest.as_deref(),
        "GitHub checksum asset",
    )?;
    let executable = executable_from_archive(
        &archive,
        &target.executable_name,
        manifest.release.archive_limit_bytes as u64,
    )?;
    let receipt = Receipt {
        schema_version: manifest.release.receipt_schema_version,
        manager: "standalone".to_owned(),
        version: latest.to_string(),
        target: target.release_target.clone(),
        executable: installation.executable.clone(),
        release_repository: manifest.release.repository.clone(),
        release_tag: release.tag_name.clone(),
        asset_name: archive_name,
        sha256: hex_digest(&executable),
    };
    let replacement = install_replacement(installation, &executable, &receipt)?;
    Ok(success(json!({
        "operation": operation,
        "managed": true,
        "previousVersion": VERSION,
        "version": latest.to_string(),
        "updated": replacement.updated,
        "replacement": replacement.state,
        "replacementStatus": replacement.status,
        "releaseTag": release.tag_name,
        "target": target.release_target,
    })))
}

fn release_manifest() -> Result<ReleaseManifest, UpgradeError> {
    serde_json::from_str(MANIFEST_JSON).map_err(|_| {
        UpgradeError::new(
            "upgrade_contract_invalid",
            "The embedded release target contract is invalid.",
        )
    })
}

fn managed_installation(
    manifest: &ReleaseManifest,
    target: &TargetIdentity,
) -> Result<ManagedInstallation, UpgradeError> {
    let executable = fs::canonicalize(std::env::current_exe().map_err(|_| unmanaged())?)
        .map_err(|_| unmanaged())?;
    let receipt_path = executable
        .parent()
        .unwrap_or(Path::new("."))
        .join(&manifest.release.receipt_file);
    validate_managed_paths(manifest, target, executable, receipt_path)
}

fn validate_managed_paths(
    manifest: &ReleaseManifest,
    target: &TargetIdentity,
    executable: PathBuf,
    receipt_path: PathBuf,
) -> Result<ManagedInstallation, UpgradeError> {
    let bytes = match read_bounded_regular(&receipt_path, manifest.release.metadata_limit_bytes) {
        Ok(bytes) => bytes,
        Err(BoundedFileError::Open) => return Err(unmanaged()),
        Err(BoundedFileError::TooLarge) => {
            return Err(UpgradeError::new(
                "upgrade_receipt_mismatch",
                "The standalone installation receipt exceeds its size limit.",
            ));
        }
        Err(BoundedFileError::NotRegular | BoundedFileError::Read) => {
            return Err(UpgradeError::new(
                "upgrade_receipt_mismatch",
                "The standalone installation receipt is invalid.",
            ));
        }
    };
    let receipt: Receipt = serde_json::from_slice(&bytes).map_err(|_| {
        UpgradeError::new(
            "upgrade_receipt_mismatch",
            "The standalone installation receipt is invalid.",
        )
    })?;
    let expected_asset = archive_name(
        &manifest.release,
        &Version::parse(&receipt.version).map_err(|_| {
            UpgradeError::new(
                "upgrade_receipt_mismatch",
                "The standalone installation receipt version is invalid.",
            )
        })?,
        &target.release_target,
    );
    if receipt.schema_version != manifest.release.receipt_schema_version
        || receipt.manager != "standalone"
        || receipt.release_repository != manifest.release.repository
        || receipt.version != VERSION
        || receipt.release_tag != format!("{}{}", manifest.release.tag_prefix, VERSION)
        || receipt.target != target.release_target
        || receipt.asset_name != expected_asset
        || fs::canonicalize(&receipt.executable).ok().as_ref() != Some(&executable)
        || !is_sha256(&receipt.sha256)
        || receipt.sha256 != file_digest(&executable, manifest.release.archive_limit_bytes)?
    {
        return Err(UpgradeError::new(
            "upgrade_receipt_mismatch",
            "The executable and standalone installation receipt do not agree; reinstall from the canonical GitHub Release.",
        ));
    }
    Ok(ManagedInstallation {
        executable,
        receipt_path,
    })
}

fn unmanaged() -> UpgradeError {
    UpgradeError::new(
        "unmanaged_installation",
        "This executable is not owned by a standalone KASB receipt. Upgrade it with npm, Cargo, or the installation method that placed it here.",
    )
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum BoundedFileError {
    Open,
    NotRegular,
    TooLarge,
    Read,
}

fn read_bounded_regular(path: &Path, limit: usize) -> Result<Vec<u8>, BoundedFileError> {
    // Classify before opening because Windows rejects directory handles, then revalidate the
    // opened handle so a path change cannot substitute a non-regular stream after the check.
    let path_metadata = fs::symlink_metadata(path).map_err(|_| BoundedFileError::Open)?;
    if !path_metadata.file_type().is_file() {
        return Err(BoundedFileError::NotRegular);
    }
    let file = File::open(path).map_err(|_| BoundedFileError::Open)?;
    let metadata = file.metadata().map_err(|_| BoundedFileError::Read)?;
    if !metadata.is_file() {
        return Err(BoundedFileError::NotRegular);
    }
    if metadata.len() > limit as u64 {
        return Err(BoundedFileError::TooLarge);
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| BoundedFileError::Read)?;
    if bytes.len() > limit {
        return Err(BoundedFileError::TooLarge);
    }
    Ok(bytes)
}

#[cfg(not(windows))]
fn reconcile_deferred_status(_policy: &ReleasePolicy) -> Result<Vec<PathBuf>, UpgradeError> {
    Ok(Vec::new())
}

#[cfg(windows)]
fn reconcile_deferred_status(policy: &ReleasePolicy) -> Result<Vec<PathBuf>, UpgradeError> {
    let executable = fs::canonicalize(std::env::current_exe().map_err(|_| unmanaged())?)
        .map_err(|_| unmanaged())?;
    let parent = executable.parent().unwrap_or(Path::new("."));
    let mut statuses = fs::read_dir(parent)
        .map_err(|_| {
            UpgradeError::new(
                "upgrade_recovery_required",
                "Could not inspect prior Windows upgrade status.",
            )
        })?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| {
                    name.starts_with(".kasb-upgrade-") && name.ends_with(".status.json")
                })
        })
        .collect::<Vec<_>>();
    statuses.sort();
    let mut completed = Vec::new();
    for status in statuses {
        let bytes = match read_bounded_regular(&status, policy.metadata_limit_bytes) {
            Ok(bytes) => bytes,
            Err(BoundedFileError::TooLarge) => {
                return Err(UpgradeError::new(
                    "upgrade_recovery_required",
                    "Prior Windows upgrade status exceeds its size limit.",
                ));
            }
            Err(_) => {
                return Err(UpgradeError::new(
                    "upgrade_recovery_required",
                    "Could not read a regular prior Windows upgrade status.",
                ));
            }
        };
        let value: serde_json::Value = serde_json::from_slice(&bytes).map_err(|_| {
            UpgradeError::new(
                "upgrade_recovery_required",
                "Prior Windows upgrade status is invalid.",
            )
        })?;
        match value.get("status").and_then(serde_json::Value::as_str) {
            Some("applied" | "rolledBack") => {
                completed.push(status);
            }
            Some("failed") => {
                return Err(UpgradeError::new(
                    "upgrade_recovery_required",
                    "The prior Windows replacement failed and may require manual recovery.",
                )
                .recovery(deferred_recovery_hint(&status, &value)));
            }
            Some("pending") => {
                return Err(UpgradeError::new(
                    "upgrade_recovery_required",
                    "A prior Windows replacement did not reach a terminal state.",
                )
                .recovery(deferred_recovery_hint(&status, &value)));
            }
            _ => {
                return Err(UpgradeError::new(
                    "upgrade_recovery_required",
                    "Prior Windows upgrade status has an unknown state.",
                )
                .recovery(format!(
                    "Inspect the bounded recovery record at {}.",
                    status.display()
                )));
            }
        }
    }
    Ok(completed)
}

#[cfg(any(windows, test))]
fn deferred_recovery_hint(status: &Path, value: &serde_json::Value) -> String {
    let phase = value
        .get("phase")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("unknown");
    let paths = [
        "executable",
        "stagedExecutable",
        "executableBackup",
        "receipt",
        "stagedReceipt",
        "receiptBackup",
        "helper",
    ]
    .into_iter()
    .filter_map(|key| {
        value
            .get(key)
            .and_then(serde_json::Value::as_str)
            .map(|path| format!("{key}={path}"))
    })
    .collect::<Vec<_>>()
    .join(", ");
    if paths.is_empty() {
        format!(
            "Inspect the bounded recovery record at {} (phase: {phase}).",
            status.display()
        )
    } else {
        format!(
            "Inspect the bounded recovery record at {} (phase: {phase}; {paths}).",
            status.display()
        )
    }
}

fn clear_completed_replacements(statuses: Vec<PathBuf>) -> Result<(), UpgradeError> {
    for status in statuses {
        fs::remove_file(&status).map_err(|_| {
            UpgradeError::new(
                "upgrade_recovery_required",
                "The upgraded executable and receipt agree, but the completed Windows status could not be cleared.",
            )
            .recovery(format!(
                "Remove the completed replacement status at {}.",
                status.display()
            ))
        })?;
    }
    Ok(())
}

struct GithubReleaseSource {
    client: wreq::Client,
    repository: String,
    metadata_limit: usize,
}

impl GithubReleaseSource {
    fn new(policy: &ReleasePolicy) -> Result<Self, UpgradeError> {
        #[cfg(test)]
        RELEASE_TRANSPORT_CONSTRUCTIONS.fetch_add(1, Ordering::SeqCst);
        let client = wreq::Client::builder()
            .https_only(true)
            .timeout(Duration::from_secs(policy.request_timeout_seconds))
            .connect_timeout(Duration::from_secs(policy.connect_timeout_seconds))
            .redirect(wreq::redirect::Policy::limited(policy.redirect_limit))
            .retry(wreq::retry::Policy::never())
            .build()
            .map_err(|_| {
                UpgradeError::network("Could not initialize bounded release transport.")
            })?;
        Ok(Self {
            client,
            repository: policy.repository.clone(),
            metadata_limit: policy.metadata_limit_bytes,
        })
    }

    async fn get(&self, url: &str, limit: usize) -> Result<Vec<u8>, UpgradeError> {
        let response = self
            .client
            .get(url)
            .header(ACCEPT, "application/vnd.github+json")
            .header(USER_AGENT, format!("kasb/{VERSION}"))
            .send()
            .await
            .map_err(|error| {
                UpgradeError::network(if error.is_timeout() {
                    "The release request timed out."
                } else {
                    "The release request failed."
                })
            })?;
        let status = response.status().as_u16();
        if let Some(error) = http_status_error(status) {
            return Err(error);
        }
        if response
            .content_length()
            .is_some_and(|length| length > limit as u64)
        {
            return Err(UpgradeError::new(
                "upgrade_response_too_large",
                "The release response exceeds its size limit.",
            ));
        }
        let mut body = Vec::new();
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk
                .map_err(|_| UpgradeError::network("The release download was interrupted."))?;
            if body.len().saturating_add(chunk.len()) > limit {
                return Err(UpgradeError::new(
                    "upgrade_response_too_large",
                    "The release response exceeds its size limit.",
                ));
            }
            body.extend_from_slice(&chunk);
        }
        Ok(body)
    }
}

fn http_status_error(status: u16) -> Option<UpgradeError> {
    if (200..300).contains(&status) {
        return None;
    }
    Some(match status {
        403 | 429 => UpgradeError::network("GitHub rate-limited the release request."),
        500..=599 => UpgradeError::network("GitHub could not serve the release request."),
        404 => UpgradeError::new(
            "upgrade_asset_missing",
            "The canonical release or asset is missing.",
        ),
        _ => UpgradeError::new(
            "upgrade_http_failure",
            format!("GitHub rejected the release request with HTTP {status}."),
        ),
    })
}

#[cfg(test)]
pub(crate) fn reset_release_transport_constructions() {
    RELEASE_TRANSPORT_CONSTRUCTIONS.store(0, Ordering::SeqCst);
}

#[cfg(test)]
pub(crate) fn release_transport_constructions() -> usize {
    RELEASE_TRANSPORT_CONSTRUCTIONS.load(Ordering::SeqCst)
}

impl ReleaseSource for GithubReleaseSource {
    async fn latest(&self) -> Result<Release, UpgradeError> {
        let url = format!(
            "https://api.github.com/repos/{}/releases/latest",
            self.repository
        );
        let bytes = self.get(&url, self.metadata_limit).await?;
        serde_json::from_slice(&bytes).map_err(|_| {
            UpgradeError::new(
                "upgrade_release_invalid",
                "GitHub returned invalid release metadata.",
            )
        })
    }

    async fn download(&self, asset: &ReleaseAsset, limit: usize) -> Result<Vec<u8>, UpgradeError> {
        self.get(&asset.browser_download_url, limit).await
    }
}

fn validate_release(release: &Release, policy: &ReleasePolicy) -> Result<(), UpgradeError> {
    if !release.immutable || release.draft || release.prerelease {
        return Err(UpgradeError::new(
            "upgrade_release_mutable",
            "The latest canonical release is not an immutable production release.",
        ));
    }
    release_version(&release.tag_name, &policy.tag_prefix)?;
    Ok(())
}

fn release_version(tag: &str, tag_prefix: &str) -> Result<Version, UpgradeError> {
    tag.strip_prefix(tag_prefix)
        .and_then(|value| Version::parse(value).ok())
        .filter(|version| version.pre.is_empty() && version.build.is_empty())
        .ok_or_else(|| {
            UpgradeError::new(
                "upgrade_release_invalid",
                "The release tag is not a canonical stable version.",
            )
        })
}

fn asset<'a>(release: &'a Release, name: &str) -> Result<&'a ReleaseAsset, UpgradeError> {
    let matches = release
        .assets
        .iter()
        .filter(|asset| asset.name == name)
        .collect::<Vec<_>>();
    if matches.len() != 1 {
        return Err(UpgradeError::new(
            "upgrade_asset_missing",
            format!("The immutable release does not contain exactly one {name} asset."),
        ));
    }
    Ok(matches[0])
}

fn validate_download_url(
    asset: &ReleaseAsset,
    tag: &str,
    policy: &ReleasePolicy,
) -> Result<(), UpgradeError> {
    let expected = format!(
        "https://github.com/{}/releases/download/{tag}/{}",
        policy.repository, asset.name
    );
    if asset.browser_download_url != expected {
        return Err(UpgradeError::new(
            "upgrade_asset_identity",
            "A release asset URL does not match the canonical repository and tag.",
        ));
    }
    Ok(())
}

fn checksum_entry(bytes: &[u8], archive: &str) -> Result<String, UpgradeError> {
    let text = std::str::from_utf8(bytes).map_err(|_| {
        UpgradeError::new(
            "upgrade_checksum_invalid",
            "The checksum manifest is not UTF-8.",
        )
    })?;
    let matches = text
        .lines()
        .filter_map(|line| line.split_once("  "))
        .filter(|(_, name)| *name == archive)
        .collect::<Vec<_>>();
    if matches.len() != 1
        || matches[0].0.len() != 64
        || !matches[0].0.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(UpgradeError::new(
            "upgrade_checksum_invalid",
            "The checksum manifest lacks one exact archive digest.",
        ));
    }
    Ok(matches[0].0.to_ascii_lowercase())
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn executable_from_archive(
    archive: &[u8],
    executable_name: &str,
    executable_limit: u64,
) -> Result<Vec<u8>, UpgradeError> {
    let decoder = GzDecoder::new(archive).take(
        executable_limit
            .saturating_add(ARCHIVE_EXPANSION_OVERHEAD)
            .saturating_add(1),
    );
    let mut tar = tar::Archive::new(decoder);
    let mut found = None;
    let mut entry_count = 0usize;
    let mut expanded_bytes = 0u64;
    for entry in tar.entries().map_err(|_| {
        UpgradeError::new(
            "upgrade_archive_invalid",
            "The release archive cannot be read.",
        )
    })? {
        entry_count += 1;
        if entry_count > 16 {
            return Err(UpgradeError::new(
                "upgrade_archive_invalid",
                "The release archive contains too many entries.",
            ));
        }
        let mut entry = entry.map_err(|_| {
            UpgradeError::new(
                "upgrade_archive_invalid",
                "The release archive contains an invalid entry.",
            )
        })?;
        expanded_bytes = expanded_bytes.saturating_add(entry.size());
        if expanded_bytes > executable_limit.saturating_mul(2) {
            return Err(UpgradeError::new(
                "upgrade_archive_invalid",
                "The expanded release archive exceeds its size limit.",
            ));
        }
        let path = entry.path().map_err(|_| {
            UpgradeError::new(
                "upgrade_archive_invalid",
                "The release archive contains an invalid path.",
            )
        })?;
        if path.as_ref() != Path::new(executable_name) {
            continue;
        }
        if found.is_some()
            || !entry.header().entry_type().is_file()
            || entry.size() == 0
            || entry.size() > executable_limit
        {
            return Err(UpgradeError::new(
                "upgrade_archive_invalid",
                "The release archive executable identity is invalid.",
            ));
        }
        let mut bytes = Vec::with_capacity(entry.size() as usize);
        entry.read_to_end(&mut bytes).map_err(|_| {
            UpgradeError::new(
                "upgrade_archive_invalid",
                "The release executable could not be read.",
            )
        })?;
        found = Some(bytes);
    }
    found.ok_or_else(|| {
        UpgradeError::new(
            "upgrade_archive_invalid",
            "The release archive is missing its executable.",
        )
    })
}

struct TargetIdentity {
    release_target: String,
    executable_name: String,
}

fn current_target(manifest: &ReleaseManifest) -> Result<TargetIdentity, UpgradeError> {
    let platform = match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        value => value,
    };
    let architecture = match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        value => value,
    };
    let libc = if cfg!(target_env = "gnu") {
        Some("glibc")
    } else {
        None
    };
    manifest
        .targets
        .iter()
        .find(|target| {
            target.npm_platform == platform
                && target.npm_arch == architecture
                && target
                    .libc
                    .as_deref()
                    .is_none_or(|required| Some(required) == libc)
        })
        .map(|target| TargetIdentity {
            release_target: target.package_directory.clone(),
            executable_name: target.cli_file.clone(),
        })
        .ok_or_else(|| {
            UpgradeError::new(
                "upgrade_target_unsupported",
                "This platform is not a supported standalone KASB target.",
            )
        })
}

fn archive_name(policy: &ReleasePolicy, version: &Version, target: &str) -> String {
    format!(
        "{}-{version}-{target}.{}",
        policy.archive_prefix, policy.archive_extension
    )
}

fn verify_digest(bytes: &[u8], expected: &str, label: &str) -> Result<(), UpgradeError> {
    if hex_digest(bytes) != expected.to_ascii_lowercase() {
        return Err(UpgradeError::new(
            "upgrade_checksum_mismatch",
            format!("The {label} SHA-256 digest does not match."),
        ));
    }
    Ok(())
}

fn verify_metadata_digest(
    bytes: &[u8],
    digest: Option<&str>,
    label: &str,
) -> Result<(), UpgradeError> {
    let Some(digest) = digest else {
        return Ok(());
    };
    let expected = digest
        .strip_prefix("sha256:")
        .filter(|value| is_sha256(value))
        .ok_or_else(|| {
            UpgradeError::new(
                "upgrade_asset_identity",
                format!("The {label} metadata digest is not a canonical SHA-256 identity."),
            )
        })?;
    verify_digest(bytes, expected, label)
}

fn hex_digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn file_digest(path: &Path, limit: usize) -> Result<String, UpgradeError> {
    let mut file = File::open(path).map_err(|_| {
        UpgradeError::new(
            "upgrade_receipt_mismatch",
            "The installed executable cannot be read.",
        )
    })?;
    let mut hasher = Sha256::new();
    let mut total = 0usize;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|_| {
            UpgradeError::new(
                "upgrade_receipt_mismatch",
                "The installed executable cannot be read.",
            )
        })?;
        if read == 0 {
            break;
        }
        total = total.saturating_add(read);
        if total > limit {
            return Err(UpgradeError::new(
                "upgrade_receipt_mismatch",
                "The installed executable exceeds its managed size limit.",
            ));
        }
        hasher.update(&buffer[..read]);
    }
    if total == 0 {
        return Err(UpgradeError::new(
            "upgrade_receipt_mismatch",
            "The installed executable is empty.",
        ));
    }
    Ok(format!("{:x}", hasher.finalize()))
}

#[derive(Debug)]
struct Replacement {
    state: &'static str,
    updated: bool,
    status: Option<PathBuf>,
}

fn install_replacement(
    installation: &ManagedInstallation,
    bytes: &[u8],
    receipt: &Receipt,
) -> Result<Replacement, UpgradeError> {
    let parent = installation.executable.parent().ok_or_else(|| {
        UpgradeError::new(
            "upgrade_staging_failure",
            "The executable has no installation directory.",
        )
    })?;
    let nonce = std::process::id();
    let staged = parent.join(format!(".kasb.new.{nonce}"));
    let staged_receipt = parent.join(format!(".kasb.receipt.new.{nonce}"));
    write_staged(&staged, bytes)?;
    verify_staged_version(&staged, &receipt.version).inspect_err(|_| {
        let _ = fs::remove_file(&staged);
    })?;
    write_json_synced(&staged_receipt, receipt).inspect_err(|_| {
        let _ = fs::remove_file(&staged);
        let _ = fs::remove_file(&staged_receipt);
    })?;

    #[cfg(not(windows))]
    {
        replace_now(installation, &staged, &staged_receipt)?;
        Ok(Replacement {
            state: "complete",
            updated: true,
            status: None,
        })
    }
    #[cfg(windows)]
    {
        let status = schedule_windows_replacement(installation, &staged, &staged_receipt)
            .inspect_err(|_| {
                let _ = fs::remove_file(&staged);
                let _ = fs::remove_file(&staged_receipt);
            })?;
        Ok(Replacement {
            state: "scheduled",
            updated: false,
            status: Some(status),
        })
    }
}

fn write_staged(path: &Path, bytes: &[u8]) -> Result<(), UpgradeError> {
    let mut file = File::options()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|_| {
            UpgradeError::new(
                "upgrade_staging_failure",
                "Could not stage the replacement on the installation filesystem.",
            )
        })?;
    let persisted = file
        .write_all(bytes)
        .and_then(|()| file.sync_all())
        .map_err(|_| {
            UpgradeError::new(
                "upgrade_staging_failure",
                "Could not persist the staged replacement.",
            )
        });
    drop(file);
    if let Err(error) = persisted {
        let _ = fs::remove_file(path);
        return Err(error);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if fs::set_permissions(path, fs::Permissions::from_mode(0o755)).is_err() {
            let _ = fs::remove_file(path);
            return Err(UpgradeError::new(
                "upgrade_staging_failure",
                "Could not make the staged replacement executable.",
            ));
        }
    }
    Ok(())
}

fn verify_staged_version(path: &Path, version: &str) -> Result<(), UpgradeError> {
    let mut child = Command::new(path)
        .arg("--version")
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|_| {
            UpgradeError::new(
                "upgrade_executable_invalid",
                "The staged executable could not report its identity.",
            )
        })?;
    let stdout = child.stdout.take().ok_or_else(|| {
        UpgradeError::new(
            "upgrade_executable_invalid",
            "The staged executable version output could not be captured.",
        )
    })?;
    let (output_sender, output_receiver) = std::sync::mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let mut output = Vec::new();
        let result = stdout.take(129).read_to_end(&mut output).map(|_| output);
        let _ = output_sender.send(result);
    });
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut exit_status = None;
    let mut stdout = None;
    loop {
        if exit_status.is_none() {
            match child.try_wait() {
                Ok(status) => exit_status = status,
                Err(_) => {
                    return Err(UpgradeError::new(
                        "upgrade_executable_invalid",
                        "The staged executable identity process could not be observed.",
                    ));
                }
            }
        }
        if stdout.is_none() {
            match output_receiver.try_recv() {
                Ok(Ok(output)) => stdout = Some(output),
                Ok(Err(_)) | Err(std::sync::mpsc::TryRecvError::Disconnected) => {
                    return Err(UpgradeError::new(
                        "upgrade_executable_invalid",
                        "The staged executable version output could not be read.",
                    ));
                }
                Err(std::sync::mpsc::TryRecvError::Empty) => {}
            }
        }
        if let (Some(status), Some(stdout)) = (exit_status.as_ref(), stdout.as_ref()) {
            if !status.success()
                || stdout.len() > 128
                || String::from_utf8_lossy(stdout).trim() != format!("kasb {version}")
            {
                return Err(UpgradeError::new(
                    "upgrade_executable_invalid",
                    "The staged executable reports a different product version.",
                ));
            }
            return Ok(());
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(UpgradeError::new(
                "upgrade_executable_invalid",
                "The staged executable did not close its bounded version output within five seconds.",
            ));
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}

fn write_json_synced(path: &Path, value: &impl Serialize) -> Result<(), UpgradeError> {
    let bytes = serde_json::to_vec(value).map_err(|_| {
        UpgradeError::new(
            "upgrade_receipt_write_failure",
            "Could not serialize the replacement receipt.",
        )
    })?;
    let mut file = File::options()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|_| {
            UpgradeError::new(
                "upgrade_receipt_write_failure",
                "Could not stage the replacement receipt.",
            )
        })?;
    let persisted = file
        .write_all(&bytes)
        .and_then(|()| file.write_all(b"\n"))
        .and_then(|()| file.sync_all())
        .map_err(|_| {
            UpgradeError::new(
                "upgrade_receipt_write_failure",
                "Could not persist the replacement receipt.",
            )
        });
    drop(file);
    if persisted.is_err() {
        let _ = fs::remove_file(path);
    }
    persisted
}

#[cfg(not(windows))]
fn replace_now(
    installation: &ManagedInstallation,
    staged: &Path,
    staged_receipt: &Path,
) -> Result<(), UpgradeError> {
    let result = replace_now_with_rollback_fault(installation, staged, staged_receipt, false);
    if result.is_err() {
        let _ = fs::remove_file(staged);
        let _ = fs::remove_file(staged_receipt);
    }
    result
}

#[cfg(not(windows))]
fn replace_now_with_rollback_fault(
    installation: &ManagedInstallation,
    staged: &Path,
    staged_receipt: &Path,
    simulate_rollback_failure: bool,
) -> Result<(), UpgradeError> {
    let parent = installation.executable.parent().unwrap_or(Path::new("."));
    let nonce = std::process::id();
    let backup = parent.join(format!(".kasb.backup.{nonce}"));
    let receipt_backup = parent.join(format!(".kasb.receipt.backup.{nonce}"));
    if fs::symlink_metadata(&backup).is_ok() || fs::symlink_metadata(&receipt_backup).is_ok() {
        return Err(UpgradeError::new(
            "upgrade_recovery_required",
            "A prior replacement backup exists for this process identity.",
        )
        .recovery(format!(
            "Inspect the existing backup paths at {} and {}.",
            backup.display(),
            receipt_backup.display()
        )));
    }
    fs::rename(&installation.executable, &backup).map_err(|_| {
        UpgradeError::new(
            "upgrade_replacement_failure",
            "Could not preserve the installed executable before replacement.",
        )
    })?;
    if fs::rename(&installation.receipt_path, &receipt_backup).is_err() {
        let restored = fs::rename(&backup, &installation.executable).is_ok()
            && sync_committed_installation(installation).is_ok();
        let _ = fs::remove_file(staged);
        let _ = fs::remove_file(staged_receipt);
        if restored {
            return Err(UpgradeError::new(
                "upgrade_replacement_failure",
                "Could not preserve the installed receipt; the executable was restored.",
            ));
        }
        return Err(UpgradeError::new(
            "upgrade_recovery_required",
            "Could not preserve the installed receipt or restore the executable.",
        )
        .recovery(format!(
            "The executable backup remains at {}.",
            backup.display()
        )));
    }
    let mut replacement = fs::rename(staged, &installation.executable)
        .and_then(|()| fs::rename(staged_receipt, &installation.receipt_path));
    if replacement.is_ok() {
        replacement = sync_committed_installation(installation)
            .map_err(|error| std::io::Error::other(error.message));
    }
    if replacement.is_ok() {
        let _ = fs::remove_file(&backup);
        let _ = fs::remove_file(&receipt_backup);
        return Ok(());
    }

    let _ = fs::remove_file(&installation.executable);
    if simulate_rollback_failure {
        let _ = fs::create_dir(&installation.executable);
    }
    let executable_rollback = fs::rename(&backup, &installation.executable);
    let _ = fs::remove_file(&installation.receipt_path);
    let receipt_rollback = fs::rename(&receipt_backup, &installation.receipt_path);
    let _ = fs::remove_file(staged);
    let _ = fs::remove_file(staged_receipt);
    let rollback_durable = executable_rollback.is_ok()
        && receipt_rollback.is_ok()
        && sync_committed_installation(installation).is_ok();
    if rollback_durable {
        return Err(UpgradeError::new(
            "upgrade_replacement_failure",
            "The upgrade failed and the previous installation was restored.",
        ));
    }
    let recovery = parent.join(format!(".kasb-upgrade-recovery.{nonce}.json"));
    let state = json!({
        "executable": installation.executable,
        "executableBackup": backup,
        "receipt": installation.receipt_path,
        "receiptBackup": receipt_backup,
    });
    let recovery_recorded = File::options()
        .create_new(true)
        .write(true)
        .open(&recovery)
        .and_then(|mut file| {
            file.write_all(format!("{state}\n").as_bytes())?;
            file.sync_all()
        })
        .is_ok();
    let recovery_hint = if recovery_recorded {
        format!("Recovery paths are recorded at {}.", recovery.display())
    } else {
        format!(
            "Restore the executable from {} and the receipt from {}.",
            backup.display(),
            receipt_backup.display()
        )
    };
    Err(UpgradeError::new(
        "upgrade_recovery_required",
        "The upgrade and automatic rollback both failed.",
    )
    .recovery(recovery_hint))
}

#[cfg(windows)]
fn schedule_windows_replacement(
    installation: &ManagedInstallation,
    staged: &Path,
    staged_receipt: &Path,
) -> Result<PathBuf, UpgradeError> {
    use std::os::windows::process::CommandExt;

    let parent = installation.executable.parent().ok_or_else(|| {
        UpgradeError::new(
            "upgrade_staging_failure",
            "The executable has no installation directory.",
        )
    })?;
    let nonce = std::process::id();
    let helper = parent.join(format!(".kasb-upgrade-{nonce}.ps1"));
    let status = parent.join(format!(".kasb-upgrade-{nonce}.status.json"));
    let backup = parent.join(format!(".kasb.backup.{nonce}.exe"));
    let receipt_backup = parent.join(format!(".kasb.receipt.backup.{nonce}.json"));
    if [&helper, &backup, &receipt_backup]
        .iter()
        .any(|path| fs::symlink_metadata(path).is_ok())
    {
        return Err(UpgradeError::new(
            "upgrade_recovery_required",
            "Prior Windows replacement state exists for this process identity.",
        )
        .recovery(format!(
            "Inspect replacement state adjacent to {}.",
            installation.executable.display()
        )));
    }
    let script = windows_replacement_script(
        std::process::id(),
        &installation.executable,
        staged,
        &backup,
        &installation.receipt_path,
        staged_receipt,
        &receipt_backup,
        &status,
        false,
        false,
        None,
    );
    write_windows_status(
        &status,
        &json!({
            "status": "pending",
            "phase": "staged",
            "executable": installation.executable,
            "stagedExecutable": staged,
            "executableBackup": backup,
            "receipt": installation.receipt_path,
            "stagedReceipt": staged_receipt,
            "receiptBackup": receipt_backup,
            "helper": helper,
            "hadExecutable": installation.executable.exists(),
            "hadReceipt": installation.receipt_path.exists(),
        }),
    )?;
    fs::write(&helper, script).map_err(|_| {
        let _ = fs::remove_file(&status);
        UpgradeError::new(
            "upgrade_replacement_failure",
            "Could not stage the Windows replacement helper.",
        )
    })?;
    let started = Command::new("powershell.exe")
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
        ])
        .arg(&helper)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(0x0800_0000)
        .spawn();
    if started.is_err() {
        let _ = fs::remove_file(&helper);
        let _ = fs::remove_file(&status);
        return Err(UpgradeError::new(
            "upgrade_replacement_failure",
            "Could not start the Windows replacement helper; no installed file was changed.",
        ));
    }
    Ok(status)
}

#[cfg(windows)]
fn write_windows_status(path: &Path, value: &impl Serialize) -> Result<(), UpgradeError> {
    let bytes = serde_json::to_vec(value).map_err(|_| {
        UpgradeError::new(
            "upgrade_replacement_failure",
            "Could not serialize the Windows replacement status.",
        )
    })?;
    let mut file = File::options()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|_| {
            UpgradeError::new(
                "upgrade_recovery_required",
                "A Windows replacement status already exists for this process identity.",
            )
            .recovery(format!(
                "Inspect the existing status at {}.",
                path.display()
            ))
        })?;
    let persisted = file
        .write_all(&bytes)
        .and_then(|()| file.write_all(b"\n"))
        .and_then(|()| file.sync_all())
        .map_err(|_| {
            UpgradeError::new(
                "upgrade_replacement_failure",
                "Could not persist the pending Windows replacement status.",
            )
        });
    drop(file);
    if persisted.is_err() {
        let _ = fs::remove_file(path);
    }
    persisted
}

#[allow(clippy::too_many_arguments)]
#[cfg(any(windows, test))]
fn windows_replacement_script(
    parent_pid: u32,
    executable: &Path,
    staged: &Path,
    backup: &Path,
    receipt: &Path,
    staged_receipt: &Path,
    receipt_backup: &Path,
    status: &Path,
    simulate_rollback_failure: bool,
    fail_after_receipt_publish: bool,
    stop_after_phase: Option<&str>,
) -> String {
    fn literal(path: &Path) -> String {
        format!("'{}'", path.to_string_lossy().replace('\'', "''"))
    }
    format!(
        r#"$ErrorActionPreference = 'Stop'
$exe = {}
$staged = {}
$backup = {}
$receipt = {}
$stagedReceipt = {}
$receiptBackup = {}
$status = {}
$helper = $MyInvocation.MyCommand.Path
$simulateRollbackFailure = {}
$failAfterReceiptPublish = {}
$stopAfterPhase = {}
$hadReceipt = Test-Path -LiteralPath $receipt
function Flush-DurableFile([string]$path) {{
  $stream = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
  try {{ $stream.Flush($true) }} finally {{ $stream.Dispose() }}
}}
function Test-AnyPath([string]$path) {{
  return [System.IO.File]::Exists($path) -or [System.IO.Directory]::Exists($path)
}}
function Remove-ExactFile([string]$path) {{
  if ([System.IO.Directory]::Exists($path)) {{ throw 'replacement destination is not a regular file' }}
  if ([System.IO.File]::Exists($path)) {{ [System.IO.File]::Delete($path) }}
  if (Test-AnyPath $path) {{ throw 'replacement destination could not be removed' }}
}}
function Move-ExactFile([string]$source, [string]$destination) {{
  if (-not [System.IO.File]::Exists($source)) {{ throw 'replacement source is missing' }}
  if (Test-AnyPath $destination) {{ throw 'replacement destination still exists' }}
  [System.IO.File]::Move($source, $destination)
}}
function Write-TerminalStatus([hashtable]$value) {{
  $value.executable = $exe
  $value.stagedExecutable = $staged
  $value.executableBackup = $backup
  $value.receipt = $receipt
  $value.stagedReceipt = $stagedReceipt
  $value.receiptBackup = $receiptBackup
  $value.helper = $helper
  $value.hadReceipt = $hadReceipt
  $statusJson = $value | ConvertTo-Json -Compress
  $statusNonce = [guid]::NewGuid().ToString('N')
  $statusNext = "$status.$statusNonce.next"
  $statusPrevious = "$status.$statusNonce.previous"
  try {{
    [System.IO.File]::WriteAllText($statusNext, $statusJson, (New-Object System.Text.UTF8Encoding($false)))
    Flush-DurableFile $statusNext
    [System.IO.File]::Replace($statusNext, $status, $statusPrevious)
    Flush-DurableFile $status
    try {{ [System.IO.File]::Delete($statusPrevious) }} catch {{}}
  }} finally {{
    try {{ [System.IO.File]::Delete($statusNext) }} catch {{}}
  }}
}}
Wait-Process -Id {} -ErrorAction SilentlyContinue
try {{
  Write-TerminalStatus @{{ status = 'pending'; phase = 'backingUp' }}
  if ($stopAfterPhase -eq 'backingUp') {{ exit 86 }}
  if ($hadReceipt) {{ Move-ExactFile $receipt $receiptBackup }}
  Move-ExactFile $exe $backup
  Write-TerminalStatus @{{ status = 'pending'; phase = 'replacing' }}
  if ($stopAfterPhase -eq 'replacing') {{ exit 86 }}
  Move-ExactFile $staged $exe
  Move-ExactFile $stagedReceipt $receipt
  Flush-DurableFile $exe
  Flush-DurableFile $receipt
  if ($failAfterReceiptPublish) {{ throw 'simulated failure after receipt publication' }}
  Write-TerminalStatus @{{ status = 'applied'; phase = 'complete' }}
  Remove-Item -Force -ErrorAction SilentlyContinue -LiteralPath $backup, $receiptBackup
}} catch {{
  $replacementError = $_.Exception.Message
  $rollbackOk = $true
  $rollbackErrors = [System.Collections.Generic.List[string]]::new()
  if ($simulateRollbackFailure -and [System.IO.File]::Exists($backup)) {{
    Remove-ExactFile $exe
    New-Item -ItemType Directory -Path $exe -Force | Out-Null
  }}
  if ([System.IO.File]::Exists($backup)) {{
    try {{
      if (-not $simulateRollbackFailure) {{ Remove-ExactFile $exe }}
      Move-ExactFile $backup $exe
    }} catch {{
      $rollbackOk = $false
      [void]$rollbackErrors.Add("executable restore: $($_.Exception.Message)")
    }}
  }}
  if ($hadReceipt -and [System.IO.File]::Exists($receiptBackup)) {{
    try {{
      Remove-ExactFile $receipt
      Move-ExactFile $receiptBackup $receipt
    }} catch {{
      $rollbackOk = $false
      [void]$rollbackErrors.Add("receipt restore: $($_.Exception.Message)")
    }}
  }}
  if (-not [System.IO.File]::Exists($exe)) {{
    $rollbackOk = $false
    [void]$rollbackErrors.Add('restored executable is missing')
  }}
  if (-not [System.IO.File]::Exists($receipt)) {{
    $rollbackOk = $false
    [void]$rollbackErrors.Add('restored receipt is missing')
  }}
  if ($rollbackOk) {{
    try {{
      $oldReceipt = Get-Content -Raw -LiteralPath $receipt | ConvertFrom-Json
      $oldDigest = (Get-FileHash -Algorithm SHA256 -LiteralPath $exe).Hash.ToLowerInvariant()
      if ($oldReceipt.manager -ne 'standalone' -or $oldReceipt.sha256 -ne $oldDigest) {{ throw 'restored receipt identity mismatch' }}
      Flush-DurableFile $exe
      Flush-DurableFile $receipt
    }} catch {{
      $rollbackOk = $false
      [void]$rollbackErrors.Add("identity verification: $($_.Exception.Message)")
    }}
  }}
  if ($rollbackOk) {{
    Write-TerminalStatus @{{ status = 'rolledBack'; phase = 'complete'; message = $replacementError }}
  }} else {{
    $failureMessage = "$replacementError; rollback: $($rollbackErrors -join ' | ')"
    if ($failureMessage.Length -gt 512) {{ $failureMessage = $failureMessage.Substring(0, 512) }}
    Write-TerminalStatus @{{ status = 'failed'; phase = 'recoveryRequired'; message = $failureMessage }}
  }}
}} finally {{
  Remove-Item -Force -ErrorAction SilentlyContinue -LiteralPath $helper
}}
"#,
        literal(executable),
        literal(staged),
        literal(backup),
        literal(receipt),
        literal(staged_receipt),
        literal(receipt_backup),
        literal(status),
        if simulate_rollback_failure {
            "$true"
        } else {
            "$false"
        },
        if fail_after_receipt_publish {
            "$true"
        } else {
            "$false"
        },
        stop_after_phase
            .map(|phase| format!("'{}'", phase.replace('\'', "''")))
            .unwrap_or_else(|| "$null".to_owned()),
        parent_pid,
    )
}

#[cfg(not(windows))]
fn sync_committed_installation(installation: &ManagedInstallation) -> Result<(), UpgradeError> {
    File::open(&installation.executable)
        .and_then(|file| file.sync_all())
        .and_then(|()| File::open(&installation.receipt_path)?.sync_all())
        .map_err(|_| {
            UpgradeError::new(
                "upgrade_replacement_failure",
                "The replacement was published but could not be made durable.",
            )
        })?;
    #[cfg(unix)]
    File::open(installation.executable.parent().unwrap_or(Path::new(".")))
        .and_then(|directory| directory.sync_all())
        .map_err(|_| {
            UpgradeError::new(
                "upgrade_replacement_failure",
                "The installation directory could not be made durable.",
            )
        })?;
    Ok(())
}

fn failure(error: UpgradeError) -> ProcessOutput {
    ProcessOutput::failure(
        json!({
            "failure": {
                "code": error.code,
                "message": error.message,
                "retryable": error.retryable,
                "recoverable": error.recovery.is_some(),
                "recoveryHint": error.recovery,
            },
            "metadata": { "operation": "upgrade", "transportVersion": "1" },
            "warnings": [],
        })
        .to_string(),
    )
}

fn success(result: serde_json::Value) -> serde_json::Value {
    json!({
        "result": result,
        "metadata": { "operation": "upgrade", "transportVersion": "1" },
        "warnings": [],
    })
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;
    use std::io::Cursor;

    use super::*;

    fn manifest() -> ReleaseManifest {
        release_manifest().unwrap()
    }

    struct FakeSource {
        release: Release,
        checksums: Vec<u8>,
        archive: Vec<u8>,
        fail_latest: bool,
        downloads: Cell<usize>,
    }

    impl ReleaseSource for FakeSource {
        async fn latest(&self) -> Result<Release, UpgradeError> {
            if self.fail_latest {
                Err(UpgradeError::network("simulated network failure"))
            } else {
                Ok(self.release.clone())
            }
        }

        async fn download(
            &self,
            asset: &ReleaseAsset,
            _limit: usize,
        ) -> Result<Vec<u8>, UpgradeError> {
            self.downloads.set(self.downloads.get() + 1);
            let checksum_name = &manifest().release.checksum_asset;
            if &asset.name == checksum_name {
                Ok(self.checksums.clone())
            } else {
                Ok(self.archive.clone())
            }
        }
    }

    fn test_target() -> TargetIdentity {
        TargetIdentity {
            release_target: "linux-x64-gnu".to_owned(),
            executable_name: "kasb".to_owned(),
        }
    }

    fn executable_script(version: &str) -> Vec<u8> {
        format!(
            "#!/bin/sh\nif [ \"$1\" = --version ]; then echo 'kasb {version}'; exit 0; fi\nexit 1\n"
        )
        .into_bytes()
    }

    #[cfg(unix)]
    fn make_executable(path: &Path) {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o755)).unwrap();
    }

    #[cfg(not(unix))]
    fn make_executable(_path: &Path) {}

    fn archive_with(executable: &[u8]) -> Vec<u8> {
        let mut encoded = Vec::new();
        {
            let encoder =
                flate2::write::GzEncoder::new(&mut encoded, flate2::Compression::default());
            let mut builder = tar::Builder::new(encoder);
            let mut header = tar::Header::new_gnu();
            header.set_size(executable.len() as u64);
            header.set_mode(0o755);
            header.set_cksum();
            builder
                .append_data(&mut header, "kasb", Cursor::new(executable))
                .unwrap();
            builder.finish().unwrap();
        }
        encoded
    }

    fn fake_source(version: &str) -> FakeSource {
        let manifest = manifest();
        let target = test_target();
        let archive = archive_with(&executable_script(version));
        let archive_name = archive_name(
            &manifest.release,
            &Version::parse(version).unwrap(),
            &target.release_target,
        );
        let tag = format!("{}{}", manifest.release.tag_prefix, version);
        let checksum = hex_digest(&archive);
        let repository = &manifest.release.repository;
        let checksum_name = manifest.release.checksum_asset.clone();
        FakeSource {
            release: Release {
                tag_name: tag.clone(),
                immutable: true,
                draft: false,
                prerelease: false,
                assets: vec![
                    ReleaseAsset {
                        name: archive_name.clone(),
                        browser_download_url: format!(
                            "https://github.com/{repository}/releases/download/{tag}/{archive_name}"
                        ),
                        size: archive.len() as u64,
                        digest: Some(format!("sha256:{checksum}")),
                    },
                    ReleaseAsset {
                        name: checksum_name.clone(),
                        browser_download_url: format!(
                            "https://github.com/{repository}/releases/download/{tag}/{checksum_name}"
                        ),
                        size: (64 + 2 + archive_name.len() + 1) as u64,
                        digest: None,
                    },
                ],
            },
            checksums: format!("{checksum}  {archive_name}\n").into_bytes(),
            archive,
            fail_latest: false,
            downloads: Cell::new(0),
        }
    }

    fn test_installation(directory: &tempfile::TempDir) -> ManagedInstallation {
        let executable = directory.path().join("kasb");
        let receipt_path = directory.path().join(".kasb-receipt.json");
        fs::write(&executable, executable_script(VERSION)).unwrap();
        make_executable(&executable);
        fs::write(&receipt_path, b"old receipt\n").unwrap();
        ManagedInstallation {
            executable,
            receipt_path,
        }
    }

    #[test]
    fn checksum_manifest_requires_one_exact_entry() {
        let digest = "a".repeat(64);
        assert_eq!(
            checksum_entry(
                format!("{digest}  kasb-1.tar.gz\n").as_bytes(),
                "kasb-1.tar.gz"
            )
            .unwrap(),
            digest
        );
        assert!(checksum_entry(format!("{digest}  other\n").as_bytes(), "kasb-1.tar.gz").is_err());
        assert!(
            checksum_entry(
                format!("{digest}  kasb-1.tar.gz\n{digest}  kasb-1.tar.gz\n").as_bytes(),
                "kasb-1.tar.gz"
            )
            .is_err()
        );
    }

    #[test]
    fn archive_extraction_requires_exactly_one_regular_executable() {
        let mut encoded = Vec::new();
        {
            let encoder =
                flate2::write::GzEncoder::new(&mut encoded, flate2::Compression::default());
            let mut builder = tar::Builder::new(encoder);
            let bytes = b"binary";
            let mut header = tar::Header::new_gnu();
            header.set_size(bytes.len() as u64);
            header.set_mode(0o755);
            header.set_cksum();
            builder
                .append_data(&mut header, "kasb", Cursor::new(bytes))
                .unwrap();
            builder.finish().unwrap();
        }
        assert_eq!(
            executable_from_archive(&encoded, "kasb", 1024).unwrap(),
            b"binary"
        );

        let mut encoded = Vec::new();
        {
            let encoder =
                flate2::write::GzEncoder::new(&mut encoded, flate2::Compression::default());
            let mut builder = tar::Builder::new(encoder);
            for name in ["kasb", "unexpected"] {
                let mut header = tar::Header::new_gnu();
                header.set_size(1);
                header.set_mode(0o755);
                header.set_cksum();
                builder
                    .append_data(&mut header, name, Cursor::new(b"x"))
                    .unwrap();
            }
            builder.finish().unwrap();
        }
        assert_eq!(
            executable_from_archive(&encoded, "kasb", 1024).unwrap(),
            b"x"
        );

        let mut encoded = Vec::new();
        {
            let encoder =
                flate2::write::GzEncoder::new(&mut encoded, flate2::Compression::default());
            let mut builder = tar::Builder::new(encoder);
            for _ in 0..2 {
                let mut header = tar::Header::new_gnu();
                header.set_size(1);
                header.set_mode(0o755);
                header.set_cksum();
                builder
                    .append_data(&mut header, "kasb", Cursor::new(b"x"))
                    .unwrap();
            }
            builder.finish().unwrap();
        }
        assert!(executable_from_archive(&encoded, "kasb", 1024).is_err());

        let mut encoded = Vec::new();
        {
            let encoder =
                flate2::write::GzEncoder::new(&mut encoded, flate2::Compression::default());
            let mut builder = tar::Builder::new(encoder);
            let mut header = tar::Header::new_gnu();
            header.set_entry_type(tar::EntryType::Directory);
            header.set_size(0);
            header.set_mode(0o755);
            header.set_cksum();
            builder
                .append_data(&mut header, "kasb", Cursor::new([]))
                .unwrap();
            builder.finish().unwrap();
        }
        assert!(executable_from_archive(&encoded, "kasb", 1024).is_err());

        let mut encoded = Vec::new();
        {
            let encoder =
                flate2::write::GzEncoder::new(&mut encoded, flate2::Compression::default());
            let mut builder = tar::Builder::new(encoder);
            let mut header = tar::Header::new_gnu();
            header.set_size(1);
            header.set_mode(0o755);
            header.set_cksum();
            builder
                .append_data(&mut header, "nested/kasb", Cursor::new(b"x"))
                .unwrap();
            builder.finish().unwrap();
        }
        assert!(executable_from_archive(&encoded, "kasb", 1024).is_err());
    }

    #[test]
    fn github_http_statuses_distinguish_retryable_failures() {
        assert!(http_status_error(200).is_none());
        for status in [403, 429, 500, 503] {
            assert!(http_status_error(status).unwrap().retryable);
        }
        for status in [400, 404] {
            assert!(!http_status_error(status).unwrap().retryable);
        }
        assert_eq!(
            http_status_error(404).unwrap().code,
            "upgrade_asset_missing"
        );
    }

    #[test]
    fn check_mode_preserves_completed_replacement_status() {
        assert!(!should_clear_completed_replacements(true));
        assert!(should_clear_completed_replacements(false));
    }

    #[test]
    fn immutable_stable_release_is_required() {
        let manifest = manifest();
        let release = Release {
            tag_name: "v1.2.3".to_owned(),
            immutable: true,
            draft: false,
            prerelease: false,
            assets: vec![],
        };
        assert!(validate_release(&release, &manifest.release).is_ok());
        assert!(
            validate_release(
                &Release {
                    immutable: false,
                    ..release
                },
                &manifest.release
            )
            .is_err()
        );
        assert!(release_version("v1.2.3-rc.1", &manifest.release.tag_prefix).is_err());
    }

    #[cfg(not(windows))]
    #[test]
    fn replacement_failure_rolls_back_binary_and_receipt() {
        let manifest = manifest();
        let directory = tempfile::tempdir().unwrap();
        let executable = directory.path().join("kasb");
        let receipt_path = directory.path().join(&manifest.release.receipt_file);
        fs::write(&executable, b"old").unwrap();
        fs::write(&receipt_path, b"old receipt").unwrap();
        let staged = directory.path().join("staged");
        fs::write(&staged, b"new").unwrap();
        let missing_receipt = directory.path().join("missing");
        let installation = ManagedInstallation {
            executable: executable.clone(),
            receipt_path: receipt_path.clone(),
        };
        let error = replace_now(&installation, &staged, &missing_receipt).unwrap_err();
        assert_eq!(error.code, "upgrade_replacement_failure");
        assert_eq!(fs::read(executable).unwrap(), b"old");
        assert_eq!(fs::read(receipt_path).unwrap(), b"old receipt");
    }

    #[cfg(not(windows))]
    #[test]
    fn stale_backup_state_blocks_replacement_without_destroying_evidence() {
        let manifest = manifest();
        let directory = tempfile::tempdir().unwrap();
        let executable = directory.path().join("kasb");
        let receipt_path = directory.path().join(&manifest.release.receipt_file);
        let staged = directory.path().join("staged");
        let staged_receipt = directory.path().join("staged-receipt");
        fs::write(&executable, b"old").unwrap();
        fs::write(&receipt_path, b"old receipt").unwrap();
        fs::write(&staged, b"new").unwrap();
        fs::write(&staged_receipt, b"new receipt").unwrap();
        let backup = directory
            .path()
            .join(format!(".kasb.backup.{}", std::process::id()));
        fs::write(&backup, b"prior recovery evidence").unwrap();
        let installation = ManagedInstallation {
            executable: executable.clone(),
            receipt_path: receipt_path.clone(),
        };

        let error = replace_now(&installation, &staged, &staged_receipt).unwrap_err();
        assert_eq!(error.code, "upgrade_recovery_required");
        assert_eq!(fs::read(backup).unwrap(), b"prior recovery evidence");
        assert_eq!(fs::read(executable).unwrap(), b"old");
        assert_eq!(fs::read(receipt_path).unwrap(), b"old receipt");
        assert!(!staged.exists());
        assert!(!staged_receipt.exists());
    }

    #[cfg(not(windows))]
    #[test]
    fn rollback_failure_reports_exact_recovery_state() {
        let manifest = manifest();
        let directory = tempfile::tempdir().unwrap();
        let executable = directory.path().join("kasb");
        let receipt_path = directory.path().join(&manifest.release.receipt_file);
        fs::write(&executable, b"old").unwrap();
        fs::write(&receipt_path, b"old receipt").unwrap();
        let staged = directory.path().join("staged");
        fs::write(&staged, b"new").unwrap();
        let installation = ManagedInstallation {
            executable: executable.clone(),
            receipt_path,
        };
        let error = replace_now_with_rollback_fault(
            &installation,
            &staged,
            &directory.path().join("missing-receipt"),
            true,
        )
        .unwrap_err();
        assert_eq!(error.code, "upgrade_recovery_required");
        assert!(error.recovery.is_some());
        let recovery = directory.path().join(format!(
            ".kasb-upgrade-recovery.{}.json",
            std::process::id()
        ));
        let recovery_state: serde_json::Value =
            serde_json::from_slice(&fs::read(recovery).unwrap()).unwrap();
        assert_eq!(
            recovery_state["executableBackup"],
            directory
                .path()
                .join(format!(".kasb.backup.{}", std::process::id()))
                .to_string_lossy()
                .as_ref()
        );
        assert!(executable.is_dir());
    }

    #[test]
    fn managed_receipt_accepts_only_the_exact_binary_identity() {
        let manifest = manifest();
        let target = test_target();
        let directory = tempfile::tempdir().unwrap();
        let executable = directory.path().join(&target.executable_name);
        fs::write(&executable, b"installed binary").unwrap();
        let executable = fs::canonicalize(executable).unwrap();
        let receipt_path = directory.path().join(&manifest.release.receipt_file);
        let version = Version::parse(VERSION).unwrap();
        let receipt = Receipt {
            schema_version: manifest.release.receipt_schema_version,
            manager: "standalone".to_owned(),
            version: VERSION.to_owned(),
            target: target.release_target.clone(),
            executable: executable.clone(),
            release_repository: manifest.release.repository.clone(),
            release_tag: format!("{}{}", manifest.release.tag_prefix, VERSION),
            asset_name: archive_name(&manifest.release, &version, &target.release_target),
            sha256: file_digest(&executable, manifest.release.archive_limit_bytes).unwrap(),
        };
        fs::write(&receipt_path, serde_json::to_vec(&receipt).unwrap()).unwrap();
        assert!(
            validate_managed_paths(&manifest, &target, executable.clone(), receipt_path.clone())
                .is_ok()
        );

        let mut mismatched = receipt.clone();
        mismatched.sha256 = "0".repeat(64);
        fs::write(&receipt_path, serde_json::to_vec(&mismatched).unwrap()).unwrap();
        assert_eq!(
            validate_managed_paths(&manifest, &target, executable.clone(), receipt_path.clone())
                .unwrap_err()
                .code,
            "upgrade_receipt_mismatch"
        );

        fs::write(&receipt_path, serde_json::to_vec(&receipt).unwrap()).unwrap();
        fs::write(&executable, b"tampered binary").unwrap();
        assert_eq!(
            validate_managed_paths(&manifest, &target, executable.clone(), receipt_path.clone())
                .unwrap_err()
                .code,
            "upgrade_receipt_mismatch"
        );
        fs::write(&executable, b"installed binary").unwrap();

        let mut wrong_asset = receipt.clone();
        wrong_asset.asset_name = "kasb-0.1.0-wrong-target.tar.gz".to_owned();
        fs::write(&receipt_path, serde_json::to_vec(&wrong_asset).unwrap()).unwrap();
        assert_eq!(
            validate_managed_paths(&manifest, &target, executable.clone(), receipt_path.clone())
                .unwrap_err()
                .code,
            "upgrade_receipt_mismatch"
        );

        let mut wrong_manager = receipt;
        wrong_manager.manager = "npm".to_owned();
        fs::write(&receipt_path, serde_json::to_vec(&wrong_manager).unwrap()).unwrap();
        assert_eq!(
            validate_managed_paths(&manifest, &target, executable, receipt_path)
                .unwrap_err()
                .code,
            "upgrade_receipt_mismatch"
        );
    }

    #[test]
    fn missing_receipt_is_unmanaged() {
        let manifest = manifest();
        let target = test_target();
        let directory = tempfile::tempdir().unwrap();
        let executable = directory.path().join(&target.executable_name);
        fs::write(&executable, b"binary").unwrap();
        assert_eq!(
            validate_managed_paths(
                &manifest,
                &target,
                fs::canonicalize(executable).unwrap(),
                directory.path().join("missing-receipt.json"),
            )
            .unwrap_err()
            .code,
            "unmanaged_installation"
        );
    }

    #[test]
    fn bounded_metadata_reader_rejects_oversized_and_nonregular_inputs() {
        let directory = tempfile::tempdir().unwrap();
        let regular = directory.path().join("metadata.json");
        fs::write(&regular, b"12345").unwrap();
        assert_eq!(read_bounded_regular(&regular, 5).unwrap(), b"12345");
        assert_eq!(
            read_bounded_regular(&regular, 4).unwrap_err(),
            BoundedFileError::TooLarge
        );
        assert_eq!(
            read_bounded_regular(directory.path(), 1024).unwrap_err(),
            BoundedFileError::NotRegular
        );
        #[cfg(unix)]
        {
            let symlink = directory.path().join("metadata-link.json");
            std::os::unix::fs::symlink(&regular, &symlink).unwrap();
            assert_eq!(
                read_bounded_regular(&symlink, 1024).unwrap_err(),
                BoundedFileError::NotRegular
            );
        }
    }

    #[tokio::test]
    async fn no_update_and_check_do_not_download_assets() {
        let manifest = manifest();
        let directory = tempfile::tempdir().unwrap();
        let installation = test_installation(&directory);
        for check_only in [false, true] {
            let source = fake_source(VERSION);
            let result =
                execute_upgrade(check_only, &manifest, test_target(), &installation, &source)
                    .await
                    .unwrap();
            assert_eq!(result["result"]["updateAvailable"], false);
            assert_eq!(
                result["result"]["operation"],
                if check_only {
                    "upgrade-check"
                } else {
                    "upgrade"
                }
            );
            assert_eq!(source.downloads.get(), 0);
            assert_eq!(
                fs::read(&installation.executable).unwrap(),
                executable_script(VERSION)
            );
        }

        let source = fake_source("0.1.1");
        let result = execute_upgrade(true, &manifest, test_target(), &installation, &source)
            .await
            .unwrap();
        assert_eq!(result["result"]["updateAvailable"], true);
        assert_eq!(source.downloads.get(), 0);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn available_upgrade_replaces_binary_and_receipt() {
        let manifest = manifest();
        let directory = tempfile::tempdir().unwrap();
        let installation = test_installation(&directory);
        let source = fake_source("0.1.1");
        let result = execute_upgrade(false, &manifest, test_target(), &installation, &source)
            .await
            .unwrap();
        assert_eq!(result["result"]["updated"], true);
        assert_eq!(source.downloads.get(), 2);
        assert_eq!(
            fs::read(&installation.executable).unwrap(),
            executable_script("0.1.1")
        );
        let receipt: Receipt =
            serde_json::from_slice(&fs::read(&installation.receipt_path).unwrap()).unwrap();
        assert_eq!(receipt.version, "0.1.1");
        assert_eq!(receipt.sha256, hex_digest(&executable_script("0.1.1")));
    }

    #[tokio::test]
    async fn network_missing_size_and_checksum_failures_are_explicit() {
        let manifest = manifest();
        let directory = tempfile::tempdir().unwrap();
        let installation = test_installation(&directory);

        let mut network = fake_source("0.1.1");
        network.fail_latest = true;
        assert_eq!(
            execute_upgrade(true, &manifest, test_target(), &installation, &network)
                .await
                .unwrap_err()
                .code,
            "upgrade_network_failure"
        );

        let mut missing = fake_source("0.1.1");
        missing
            .release
            .assets
            .retain(|asset| asset.name == manifest.release.checksum_asset);
        assert_eq!(
            execute_upgrade(false, &manifest, test_target(), &installation, &missing)
                .await
                .unwrap_err()
                .code,
            "upgrade_asset_missing"
        );

        let mut too_large = fake_source("0.1.1");
        too_large.release.assets[1].size = manifest.release.metadata_limit_bytes as u64 + 1;
        assert_eq!(
            execute_upgrade(false, &manifest, test_target(), &installation, &too_large)
                .await
                .unwrap_err()
                .code,
            "upgrade_asset_too_large"
        );

        let mut checksum_size_mismatch = fake_source("0.1.1");
        checksum_size_mismatch.release.assets[1].size += 1;
        assert_eq!(
            execute_upgrade(
                false,
                &manifest,
                test_target(),
                &installation,
                &checksum_size_mismatch,
            )
            .await
            .unwrap_err()
            .code,
            "upgrade_asset_identity"
        );

        let mut archive_size_mismatch = fake_source("0.1.1");
        archive_size_mismatch.release.assets[0].size -= 1;
        assert_eq!(
            execute_upgrade(
                false,
                &manifest,
                test_target(),
                &installation,
                &archive_size_mismatch,
            )
            .await
            .unwrap_err()
            .code,
            "upgrade_asset_identity"
        );

        let mut mismatch = fake_source("0.1.1");
        let name = mismatch.release.assets[0].name.clone();
        mismatch.checksums = format!("{}  {name}\n", "0".repeat(64)).into_bytes();
        assert_eq!(
            execute_upgrade(false, &manifest, test_target(), &installation, &mismatch)
                .await
                .unwrap_err()
                .code,
            "upgrade_checksum_mismatch"
        );

        let mut invalid_metadata_digest = fake_source("0.1.1");
        invalid_metadata_digest.release.assets[0].digest = Some("sha256:not-a-digest".to_owned());
        assert_eq!(
            execute_upgrade(
                false,
                &manifest,
                test_target(),
                &installation,
                &invalid_metadata_digest,
            )
            .await
            .unwrap_err()
            .code,
            "upgrade_asset_identity"
        );
    }

    #[test]
    fn staging_and_receipt_write_fail_without_touching_existing_files() {
        let directory = tempfile::tempdir().unwrap();
        let existing = directory.path().join("existing");
        fs::write(&existing, b"occupied").unwrap();
        assert_eq!(
            write_staged(&existing, b"new").unwrap_err().code,
            "upgrade_staging_failure"
        );
        let receipt = Receipt {
            schema_version: 1,
            manager: "standalone".to_owned(),
            version: VERSION.to_owned(),
            target: "linux-x64-gnu".to_owned(),
            executable: directory.path().join("kasb"),
            release_repository: "cpaikr/kasb".to_owned(),
            release_tag: format!("v{VERSION}"),
            asset_name: "unused".to_owned(),
            sha256: "0".repeat(64),
        };
        assert_eq!(
            write_json_synced(&existing, &receipt).unwrap_err().code,
            "upgrade_receipt_write_failure"
        );
        assert_eq!(fs::read(existing).unwrap(), b"occupied");
    }

    #[cfg(unix)]
    #[test]
    fn staged_executable_version_mismatch_preserves_the_installation() {
        let directory = tempfile::tempdir().unwrap();
        let installation = test_installation(&directory);
        let receipt = Receipt {
            schema_version: 1,
            manager: "standalone".to_owned(),
            version: "0.1.1".to_owned(),
            target: "linux-x64-gnu".to_owned(),
            executable: installation.executable.clone(),
            release_repository: "cpaikr/kasb".to_owned(),
            release_tag: "v0.1.1".to_owned(),
            asset_name: "kasb-0.1.1-linux-x64-gnu.tar.gz".to_owned(),
            sha256: hex_digest(&executable_script("0.1.2")),
        };
        let error =
            install_replacement(&installation, &executable_script("0.1.2"), &receipt).unwrap_err();
        assert_eq!(error.code, "upgrade_executable_invalid");
        assert_eq!(
            fs::read(installation.executable).unwrap(),
            executable_script(VERSION)
        );
        assert_eq!(
            fs::read(installation.receipt_path).unwrap(),
            b"old receipt\n"
        );
    }

    #[test]
    fn windows_helper_quotes_paths_without_interpolation() {
        let path = Path::new(r"C:\Program Files\$cash\O'Brien\kasb.exe");
        let script = windows_replacement_script(
            42, path, path, path, path, path, path, path, false, false, None,
        );
        assert!(script.contains(r"'C:\Program Files\$cash\O''Brien\kasb.exe'"));
        assert!(script.contains("Wait-Process -Id 42"));
        assert!(script.contains("Flush-DurableFile $exe"));
        assert!(script.contains("status = 'rolledBack'"));
        assert!(script.contains("Move-ExactFile $backup $exe"));
        assert!(
            script.contains("[System.IO.File]::Replace($statusNext, $status, $statusPrevious)")
        );
        assert!(script.contains("Flush-DurableFile $status"));
        assert!(script.contains("$status.$statusNonce.previous"));
        assert!(
            script
                .contains("Remove-Item -Force -ErrorAction SilentlyContinue -LiteralPath $helper")
        );
    }

    #[cfg(unix)]
    #[test]
    fn staged_identity_output_is_bounded_while_the_process_runs() {
        let directory = tempfile::tempdir().unwrap();
        let executable = directory.path().join("kasb");
        fs::write(
            &executable,
            b"#!/bin/sh\nwhile :; do printf 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; done\n",
        )
        .unwrap();
        make_executable(&executable);
        let started = Instant::now();
        let error = verify_staged_version(&executable, VERSION).unwrap_err();
        assert_eq!(error.code, "upgrade_executable_invalid");
        assert!(started.elapsed() < Duration::from_secs(7));
    }

    #[cfg(unix)]
    #[test]
    fn inherited_identity_pipe_is_bounded_by_the_same_deadline() {
        let directory = tempfile::tempdir().unwrap();
        let executable = directory.path().join("kasb");
        fs::write(
            &executable,
            format!("#!/bin/sh\n(sleep 6) &\nprintf 'kasb {VERSION}\\n'\n"),
        )
        .unwrap();
        make_executable(&executable);
        let started = Instant::now();
        let error = verify_staged_version(&executable, VERSION).unwrap_err();
        assert_eq!(error.code, "upgrade_executable_invalid");
        assert!(started.elapsed() < Duration::from_secs(7));
    }

    #[test]
    fn deferred_recovery_hint_includes_phase_and_replacement_paths() {
        let value = json!({
            "status": "pending",
            "phase": "replacing",
            "executable": "C:\\kasb\\kasb.exe",
            "executableBackup": "C:\\kasb\\kasb.backup.exe",
            "receipt": "C:\\kasb\\.kasb-receipt.json",
        });
        let hint = deferred_recovery_hint(Path::new("C:\\kasb\\upgrade.status.json"), &value);
        assert!(hint.contains("phase: replacing"));
        assert!(hint.contains("executable=C:\\kasb\\kasb.exe"));
        assert!(hint.contains("executableBackup=C:\\kasb\\kasb.backup.exe"));
    }

    #[cfg(windows)]
    struct WindowsHelperResult {
        _directory: tempfile::TempDir,
        executable: PathBuf,
        backup: PathBuf,
        receipt: PathBuf,
        receipt_backup: PathBuf,
        status: serde_json::Value,
        exit_success: bool,
    }

    #[cfg(windows)]
    fn run_windows_helper_case(
        staged_receipt_exists: bool,
        simulate_rollback_failure: bool,
        fail_after_receipt_publish: bool,
        stop_after_phase: Option<&str>,
    ) -> WindowsHelperResult {
        let directory = tempfile::tempdir().unwrap();
        let executable = directory.path().join("kasb.exe");
        let staged = directory.path().join("kasb.new.exe");
        let backup = directory.path().join("kasb.backup.exe");
        let receipt = directory.path().join(".kasb-receipt.json");
        let staged_receipt = directory.path().join("receipt.new.json");
        let receipt_backup = directory.path().join("receipt.backup.json");
        let status = directory.path().join("upgrade.status.json");
        let helper = directory.path().join("upgrade.ps1");
        fs::write(&executable, b"old executable").unwrap();
        fs::write(&staged, b"new executable").unwrap();
        fs::write(
            &receipt,
            serde_json::to_vec(&json!({
                "manager": "standalone",
                "sha256": hex_digest(b"old executable"),
            }))
            .unwrap(),
        )
        .unwrap();
        if staged_receipt_exists {
            fs::write(&staged_receipt, b"new receipt").unwrap();
        }
        fs::write(&status, b"{\"status\":\"pending\",\"phase\":\"staged\"}\n").unwrap();
        fs::write(
            &helper,
            windows_replacement_script(
                i32::MAX as u32,
                &executable,
                &staged,
                &backup,
                &receipt,
                &staged_receipt,
                &receipt_backup,
                &status,
                simulate_rollback_failure,
                fail_after_receipt_publish,
                stop_after_phase,
            ),
        )
        .unwrap();
        let process = Command::new("powershell.exe")
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
            ])
            .arg(&helper)
            .status()
            .unwrap();
        let status_value = serde_json::from_slice(&fs::read(&status).unwrap()).unwrap();
        WindowsHelperResult {
            _directory: directory,
            executable,
            backup,
            receipt,
            receipt_backup,
            status: status_value,
            exit_success: process.success(),
        }
    }

    #[cfg(windows)]
    #[test]
    fn windows_helper_executes_success_rollback_failure_and_crash_protocols() {
        let applied = run_windows_helper_case(true, false, false, None);
        assert!(applied.exit_success);
        assert_eq!(applied.status["status"], "applied");
        assert_eq!(fs::read(applied.executable).unwrap(), b"new executable");
        assert!(
            !fs::read_dir(applied._directory.path())
                .unwrap()
                .any(|entry| {
                    entry
                        .unwrap()
                        .file_name()
                        .to_string_lossy()
                        .ends_with(".previous")
                })
        );

        let rolled_back = run_windows_helper_case(false, false, false, None);
        assert!(rolled_back.exit_success);
        assert_eq!(
            rolled_back.status["status"], "rolledBack",
            "status: {}",
            rolled_back.status
        );
        assert_eq!(fs::read(rolled_back.executable).unwrap(), b"old executable");

        let late_failure = run_windows_helper_case(true, false, true, None);
        assert!(late_failure.exit_success);
        assert_eq!(late_failure.status["status"], "rolledBack");
        assert_eq!(
            fs::read(late_failure.executable).unwrap(),
            b"old executable"
        );
        let late_receipt: serde_json::Value =
            serde_json::from_slice(&fs::read(late_failure.receipt).unwrap()).unwrap();
        assert_eq!(late_receipt["sha256"], hex_digest(b"old executable"));

        let failed = run_windows_helper_case(false, true, false, None);
        assert!(failed.exit_success);
        assert_eq!(failed.status["status"], "failed");
        assert!(failed.backup.exists());
        assert!(failed.receipt.exists() || failed.receipt_backup.exists());

        let interrupted = run_windows_helper_case(true, false, false, Some("replacing"));
        assert!(!interrupted.exit_success);
        assert_eq!(interrupted.status["status"], "pending");
        assert_eq!(interrupted.status["phase"], "replacing");
        assert!(!interrupted.executable.exists());
        assert!(interrupted.backup.exists());
        assert!(!interrupted.receipt.exists());
        assert!(interrupted.receipt_backup.exists());
        let hint = deferred_recovery_hint(Path::new("upgrade.status.json"), &interrupted.status);
        assert!(hint.contains("phase: replacing"));
        assert!(hint.contains("executableBackup="));
        assert!(hint.contains("receiptBackup="));
    }
}
