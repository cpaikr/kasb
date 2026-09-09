use futures_util::StreamExt;
use semver::Version;
use serde::{Deserialize, Serialize};
#[cfg(test)]
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;
use wreq::header::{ACCEPT, USER_AGENT};
const VERSION: &str = env!("CARGO_PKG_VERSION");

const MANIFEST_JSON: &str = include_str!("../../../native-targets.json");
#[cfg(test)]
static RELEASE_TRANSPORT_CONSTRUCTIONS: AtomicUsize = AtomicUsize::new(0);

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReleaseManifest {
    pub(crate) release: ReleasePolicy,
    pub(crate) targets: Vec<NativeTarget>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReleasePolicy {
    pub(crate) repository: String,
    pub(crate) retired_through_version: String,
    pub(crate) shell_installer_asset: String,
    pub(crate) powershell_installer_asset: String,
    pub(crate) tag_prefix: String,
    pub(crate) archive_prefix: String,
    pub(crate) archive_extension: String,
    pub(crate) archive_entries: Vec<String>,
    pub(crate) checksum_asset: String,
    pub(crate) receipt_file: String,
    pub(crate) receipt_schema_version: u32,
    pub(crate) metadata_limit_bytes: usize,
    pub(crate) archive_limit_bytes: usize,
    pub(crate) request_timeout_seconds: u64,
    pub(crate) archive_request_timeout_seconds: u64,
    pub(crate) transfer_stall_timeout_seconds: u64,
    pub(crate) connect_timeout_seconds: u64,
    pub(crate) redirect_limit: usize,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeTarget {
    pub(crate) npm_platform: String,
    pub(crate) npm_arch: String,
    pub(crate) libc: Option<String>,
    pub(crate) package_directory: String,
    pub(crate) cli_file: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub(crate) struct Release {
    pub(crate) html_url: String,
    pub(crate) tag_name: String,
    pub(crate) immutable: bool,
    pub(crate) draft: bool,
    pub(crate) prerelease: bool,
    pub(crate) assets: Vec<ReleaseAsset>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub(crate) struct ReleaseAsset {
    pub(crate) name: String,
    pub(crate) browser_download_url: String,
    pub(crate) size: u64,
    pub(crate) digest: Option<String>,
}

#[derive(Debug)]
pub(crate) struct UpgradeError {
    pub(crate) code: &'static str,
    pub(crate) message: String,
    pub(crate) retryable: bool,
    pub(crate) recovery: Option<String>,
}

impl UpgradeError {
    pub(crate) fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            retryable: false,
            recovery: None,
        }
    }

    pub(crate) fn network(message: impl Into<String>) -> Self {
        Self {
            code: "upgrade_network_failure",
            message: message.into(),
            retryable: true,
            recovery: None,
        }
    }

    pub(crate) fn recovery(mut self, recovery: impl Into<String>) -> Self {
        self.recovery = Some(recovery.into());
        self
    }
}

pub(crate) trait ReleaseSource {
    async fn latest(&self) -> Result<Release, UpgradeError>;
    async fn revalidate(&self, release: &Release) -> Result<(), UpgradeError>;
    async fn download(
        &self,
        asset: &ReleaseAsset,
        limit: usize,
        kind: DownloadKind,
    ) -> Result<Vec<u8>, UpgradeError>;
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum DownloadKind {
    Metadata,
    Archive,
}

pub(crate) fn release_manifest() -> Result<ReleaseManifest, UpgradeError> {
    serde_json::from_str(MANIFEST_JSON).map_err(|_| {
        UpgradeError::new(
            "upgrade_contract_invalid",
            "The embedded release target contract is invalid.",
        )
    })
}

pub(crate) struct GithubReleaseSource {
    client: wreq::Client,
    metadata_client: wreq::Client,
    policy: ReleasePolicy,
    pub(crate) latest_url: String,
    pub(crate) metadata_limit: usize,
    pub(crate) metadata_timeout: Duration,
    pub(crate) archive_timeout: Duration,
    pub(crate) stall_timeout: Duration,
}

impl GithubReleaseSource {
    pub(crate) fn new(policy: &ReleasePolicy) -> Result<Self, UpgradeError> {
        #[cfg(test)]
        RELEASE_TRANSPORT_CONSTRUCTIONS.fetch_add(1, Ordering::SeqCst);
        let latest_url = test_latest_url(&policy.repository)?.unwrap_or_else(|| {
            format!(
                "https://api.github.com/repos/{}/releases/latest",
                policy.repository
            )
        });
        let client = wreq::Client::builder()
            .https_only(latest_url.starts_with("https://"))
            .timeout(Duration::from_secs(policy.request_timeout_seconds))
            .connect_timeout(Duration::from_secs(policy.connect_timeout_seconds))
            .redirect(wreq::redirect::Policy::limited(policy.redirect_limit))
            .retry(wreq::retry::Policy::never())
            .build()
            .map_err(|_| {
                UpgradeError::network("Could not initialize bounded release transport.")
            })?;
        let metadata_client = wreq::Client::builder()
            .https_only(latest_url.starts_with("https://"))
            .redirect(wreq::redirect::Policy::none())
            .retry(wreq::retry::Policy::never())
            .build()
            .map_err(|_| UpgradeError::network("Could not initialize release inspection."))?;
        Ok(Self {
            client,
            metadata_client,
            policy: policy.clone(),
            latest_url,
            metadata_limit: policy.metadata_limit_bytes,
            metadata_timeout: Duration::from_secs(policy.request_timeout_seconds),
            archive_timeout: Duration::from_secs(policy.archive_request_timeout_seconds),
            stall_timeout: Duration::from_secs(policy.transfer_stall_timeout_seconds),
        })
    }

    async fn get(
        &self,
        url: &str,
        limit: usize,
        timeout: Duration,
    ) -> Result<Vec<u8>, UpgradeError> {
        let response = self
            .client
            .get(url)
            .header(ACCEPT, "application/vnd.github+json")
            .header(USER_AGENT, format!("kasb/{VERSION}"))
            .timeout(timeout)
            .read_timeout(self.stall_timeout)
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

impl GithubReleaseSource {
    pub(crate) async fn discover(&self) -> Result<Option<Release>, UpgradeError> {
        tokio::time::timeout(self.metadata_timeout, self.discover_inner())
            .await
            .map_err(|_| UpgradeError::network("Release inspection exceeded its deadline."))?
    }

    async fn discover_inner(&self) -> Result<Option<Release>, UpgradeError> {
        let base = self
            .latest_url
            .strip_suffix("/latest")
            .ok_or_else(invalid_list)?;
        let mut remaining = 1024 * 1024;
        let mut releases = Vec::new();
        for page in 1..=5 {
            let url = format!("{base}?per_page=100&page={page}");
            let response = self
                .metadata_client
                .get(&url)
                .header(ACCEPT, "application/vnd.github+json")
                .header(USER_AGENT, format!("kasb/{VERSION}"))
                .timeout(self.metadata_timeout)
                .send()
                .await
                .map_err(|_| UpgradeError::network("Release list request failed."))?;
            if response.status().as_u16() != 200 {
                return Err(
                    http_status_error(response.status().as_u16()).unwrap_or_else(invalid_list)
                );
            }
            let next = match response.headers().get("link") {
                None => false,
                Some(link) => {
                    validate_pagination(link.to_str().map_err(|_| invalid_list())?, base, page)?
                }
            };
            if response
                .content_length()
                .is_some_and(|size| size > remaining as u64)
            {
                return Err(invalid_list());
            }
            let mut bytes = Vec::new();
            let mut stream = response.bytes_stream();
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(|_| invalid_list())?;
                if chunk.len() > remaining {
                    return Err(invalid_list());
                }
                remaining -= chunk.len();
                bytes.extend_from_slice(&chunk);
            }
            let values: Vec<Release> =
                serde_json::from_slice(&bytes).map_err(|_| invalid_list())?;
            if values.len() > 100 || (next && values.len() != 100) {
                return Err(invalid_list());
            }
            releases.extend(values);
            if !next {
                return select_stable(releases, &self.policy);
            }
        }
        Err(invalid_list())
    }
}

fn invalid_list() -> UpgradeError {
    UpgradeError::new(
        "upgrade_release_invalid",
        "Release enumeration was incomplete or invalid.",
    )
}

fn validate_pagination(link: &str, base: &str, page: usize) -> Result<bool, UpgradeError> {
    let mut next = false;
    for entry in link.split(',') {
        let (url, relation) = entry.trim().split_once(';').ok_or_else(invalid_list)?;
        let url = url
            .trim()
            .strip_prefix('<')
            .and_then(|s| s.strip_suffix('>'))
            .ok_or_else(invalid_list)?;
        // Accept only canonical list URLs, never a server-provided origin or path.
        let query = url
            .strip_prefix(&format!("{base}?"))
            .ok_or_else(invalid_list)?;
        let mut per_page = None;
        let mut number = None;
        for field in query.split('&') {
            let (key, value) = field.split_once('=').ok_or_else(invalid_list)?;
            match key {
                "per_page" if per_page.is_none() => per_page = Some(value),
                "page" if number.is_none() => number = value.parse::<usize>().ok(),
                _ => return Err(invalid_list()),
            }
        }
        if per_page != Some("100") || number.is_none_or(|n| n == 0) {
            return Err(invalid_list());
        }
        match relation.trim() {
            "rel=\"next\"" if !next && number == Some(page + 1) => next = true,
            "rel=\"prev\"" | "rel=\"first\"" | "rel=\"last\"" => {}
            _ => return Err(invalid_list()),
        }
    }
    Ok(next)
}

fn select_stable(
    releases: Vec<Release>,
    policy: &ReleasePolicy,
) -> Result<Option<Release>, UpgradeError> {
    let retired = Version::parse(&policy.retired_through_version).map_err(|_| invalid_list())?;
    let mut selected: Option<(Version, Release)> = None;
    let mut identities = std::collections::HashSet::new();
    for release in releases {
        if release.draft || release.prerelease {
            continue;
        }
        let Ok(version) = release_version(&release.tag_name, &policy.tag_prefix) else {
            continue;
        };
        if version <= retired {
            continue;
        }
        if release.html_url
            != format!(
                "https://github.com/{}/releases/tag/{}",
                policy.repository, release.tag_name
            )
        {
            return Err(invalid_list());
        }
        if !identities.insert(version.clone()) {
            return Err(invalid_list());
        }
        if selected.as_ref().is_none_or(|(best, _)| version > *best) {
            selected = Some((version, release));
        }
    }
    Ok(selected.map(|(_, release)| release))
}

pub(crate) fn test_latest_url(repository: &str) -> Result<Option<String>, UpgradeError> {
    let allow = std::env::var("KASB_UPGRADE_TEST_ALLOW_NONCANONICAL_URLS").ok();
    let latest = std::env::var("KASB_UPGRADE_TEST_LATEST_URL").ok();
    if allow.is_none() && latest.is_none() {
        return Ok(None);
    }
    if allow.as_deref() != Some("1")
        || latest
            .as_deref()
            .is_none_or(|url| !is_loopback_test_url(url, repository))
    {
        return Err(UpgradeError::new(
            "upgrade_test_contract_invalid",
            "The test-only release URL must be the canonical loopback latest-release route.",
        ));
    }
    Ok(latest)
}

pub(crate) fn is_loopback_test_url(value: &str, repository: &str) -> bool {
    let Some(authority_and_path) = value.strip_prefix("http://127.0.0.1:") else {
        return false;
    };
    let Some((port, path)) = authority_and_path.split_once('/') else {
        return false;
    };
    !port.is_empty()
        && port.bytes().all(|byte| byte.is_ascii_digit())
        && port.parse::<u16>().is_ok_and(|port| port > 0)
        && path == format!("repos/{repository}/releases/latest")
}

pub(crate) fn http_status_error(status: u16) -> Option<UpgradeError> {
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
        self.discover().await?.ok_or_else(|| {
            UpgradeError::new(
                "upgrade_asset_missing",
                "No stable product release is published.",
            )
        })
    }

    async fn revalidate(&self, release: &Release) -> Result<(), UpgradeError> {
        let base = self
            .latest_url
            .strip_suffix("/latest")
            .ok_or_else(invalid_list)?;
        let response = self
            .metadata_client
            .get(format!("{base}/tags/{}", release.tag_name))
            .header(ACCEPT, "application/vnd.github+json")
            .header(USER_AGENT, format!("kasb/{VERSION}"))
            .timeout(self.metadata_timeout)
            .send()
            .await
            .map_err(|_| invalid_list())?;
        if response.status().as_u16() != 200 {
            return Err(invalid_list());
        }
        let mut bytes = Vec::new();
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|_| invalid_list())?;
            if bytes.len().saturating_add(chunk.len()) > self.metadata_limit {
                return Err(invalid_list());
            }
            bytes.extend_from_slice(&chunk);
        }
        let exact: Release = serde_json::from_slice(&bytes).map_err(|_| invalid_list())?;
        if &exact != release {
            return Err(UpgradeError::new(
                "upgrade_release_invalid",
                "Selected release metadata changed before installation.",
            ));
        }
        Ok(())
    }

    async fn download(
        &self,
        asset: &ReleaseAsset,
        limit: usize,
        kind: DownloadKind,
    ) -> Result<Vec<u8>, UpgradeError> {
        let timeout = match kind {
            DownloadKind::Metadata => self.metadata_timeout,
            DownloadKind::Archive => self.archive_timeout,
        };
        self.get(&asset.browser_download_url, limit, timeout).await
    }
}

pub(crate) fn validate_release(
    release: &Release,
    policy: &ReleasePolicy,
) -> Result<(), UpgradeError> {
    if !release.immutable || release.draft || release.prerelease {
        return Err(UpgradeError::new(
            "upgrade_release_mutable",
            "The latest canonical release is not an immutable production release.",
        ));
    }
    release_version(&release.tag_name, &policy.tag_prefix)?;
    Ok(())
}

pub(crate) fn release_version(tag: &str, tag_prefix: &str) -> Result<Version, UpgradeError> {
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

pub(crate) fn asset<'a>(
    release: &'a Release,
    name: &str,
) -> Result<&'a ReleaseAsset, UpgradeError> {
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

pub(crate) fn validate_download_url(
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

pub(crate) struct TargetIdentity {
    pub(crate) release_target: String,
    pub(crate) executable_name: String,
    pub(crate) archive_entries: Vec<String>,
}

pub(crate) fn current_target(manifest: &ReleaseManifest) -> Result<TargetIdentity, UpgradeError> {
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
            archive_entries: manifest
                .release
                .archive_entries
                .iter()
                .map(|entry| {
                    if entry == "{executable}" {
                        target.cli_file.clone()
                    } else {
                        entry.clone()
                    }
                })
                .collect(),
        })
        .ok_or_else(|| {
            UpgradeError::new(
                "upgrade_target_unsupported",
                "This platform is not a supported standalone KASB target.",
            )
        })
}

pub(crate) fn archive_name(policy: &ReleasePolicy, version: &Version, target: &str) -> String {
    format!(
        "{}-{version}-{target}.{}",
        policy.archive_prefix, policy.archive_extension
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> Vec<Release> {
        serde_json::from_str(include_str!(
            "../../../fixtures/version-check/releases.json"
        ))
        .unwrap()
    }

    #[test]
    fn stable_selection_uses_semantic_precedence_and_product_identity() {
        let policy = release_manifest().unwrap().release;
        let releases = fixture();
        assert_eq!(
            select_stable(releases.clone(), &policy)
                .unwrap()
                .unwrap()
                .tag_name,
            "v0.4.0"
        );
        let mut reversed = releases.clone();
        reversed.reverse();
        assert_eq!(
            select_stable(reversed, &policy).unwrap().unwrap().tag_name,
            "v0.4.0"
        );
        let excluded = releases.into_iter().skip(2).collect();
        assert!(select_stable(excluded, &policy).unwrap().is_none());
        assert!(select_stable(Vec::new(), &policy).unwrap().is_none());
    }

    #[test]
    fn ambiguous_identity_and_wrong_canonical_release_url_fail_closed() {
        let policy = release_manifest().unwrap().release;
        let mut releases = fixture();
        releases.push(releases[1].clone());
        assert!(select_stable(releases, &policy).is_err());
        let mut releases = fixture();
        releases[1].html_url = "https://example.com/release".into();
        assert!(select_stable(releases, &policy).is_err());
    }

    #[test]
    fn newest_incomplete_release_is_not_replaced_by_older_distribution() {
        let policy = release_manifest().unwrap().release;
        let mut releases = fixture();
        releases[1].immutable = false;
        releases[1].assets.clear();
        let selected = select_stable(releases, &policy).unwrap().unwrap();
        assert_eq!(selected.tag_name, "v0.4.0");
        assert!(!selected.immutable);
    }

    #[test]
    fn pagination_accepts_only_complete_canonical_navigation() {
        let base = "https://api.github.com/repos/cpaikr/kasb/releases";
        assert!(validate_pagination(&format!("<{base}?per_page=100&page=2>; rel=\"next\", <{base}?page=4&per_page=100>; rel=\"last\""), base, 1).unwrap());
        for link in [
            "<https://evil.example/?per_page=100&page=2>; rel=\"next\"".to_owned(),
            format!("<{base}?per_page=100&page=3>; rel=\"next\""),
            format!("<{base}?per_page=100&page=2&token=secret>; rel=\"next\""),
            format!(
                "<{base}?per_page=100&page=2>; rel=\"next\", <{base}?per_page=100&page=2>; rel=\"next\""
            ),
        ] {
            assert!(validate_pagination(&link, base, 1).is_err(), "{link}");
        }
    }
}
