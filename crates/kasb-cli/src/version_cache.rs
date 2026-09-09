//! Disposable, bounded observations, isolated from installation receipts.
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use fs2::FileExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
#[cfg(test)]
use tokio::time::Instant;

use crate::release::{ReleaseManifest, TargetIdentity};
use crate::version_check::{Distribution, DistributionProblem, LocalBudget, Observation, Problem};

const LIMIT: usize = 64 * 1024;
const SCHEMA: u32 = 1;
const LOCK_HEADER: &[u8] = b"kasb-version-evidence-lock-v1\n";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct CacheRecord {
    schema_version: u32,
    key: String,
    pub(crate) observation: Option<Observation>,
    pub(crate) failed_at: Option<u64>,
}

impl CacheRecord {
    pub(crate) fn empty(key: String) -> Self {
        Self {
            schema_version: SCHEMA,
            key,
            observation: None,
            failed_at: None,
        }
    }

    pub(crate) fn valid(
        &self,
        manifest: &ReleaseManifest,
        target: Option<&TargetIdentity>,
        now: u64,
    ) -> bool {
        if self.schema_version != SCHEMA
            || self.key != key(manifest, target)
            || self.failed_at.is_some_and(|time| time > now)
        {
            return false;
        }
        let Some(observation) = &self.observation else {
            return true;
        };
        if observation.observed_at > now {
            return false;
        }
        let Some(release) = &observation.release else {
            return observation.distribution == Distribution::Unknown;
        };
        let Ok(version) =
            crate::release::release_version(&release.tag, &manifest.release.tag_prefix)
        else {
            return false;
        };
        let Ok(retired) = semver::Version::parse(&manifest.release.retired_through_version) else {
            return false;
        };
        if release.version != version.to_string()
            || version <= retired
            || release.repository != manifest.release.repository
            || release.url
                != format!(
                    "https://github.com/{}/releases/tag/{}",
                    manifest.release.repository, release.tag
                )
            || release.target.as_deref() != target.map(|target| target.release_target.as_str())
        {
            return false;
        }
        match &observation.distribution {
            Distribution::Ready => target.is_some(),
            Distribution::Incomplete { problems } => {
                let Some(target) = target else {
                    return false;
                };
                let archive = crate::release::archive_name(
                    &manifest.release,
                    &version,
                    &target.release_target,
                );
                let installer = if target.executable_name.ends_with(".exe") {
                    &manifest.release.powershell_installer_asset
                } else {
                    &manifest.release.shell_installer_asset
                };
                !problems.is_empty() && problems.len() <= 4 && problems.iter().enumerate().all(|(index, problem)| {
                    match problem {
                        DistributionProblem::MutableRelease => !problems[..index].contains(problem),
                        DistributionProblem::Asset { name, .. } => [archive.as_str(), manifest.release.checksum_asset.as_str(), installer.as_str()].contains(&name.as_str())
                            && !problems[..index].iter().any(|prior| matches!(prior, DistributionProblem::Asset { name: prior, .. } if prior == name)),
                    }
                })
            }
            Distribution::Unsupported => target.is_none(),
            Distribution::Unknown => false,
        }
    }
}

pub(crate) fn key(manifest: &ReleaseManifest, target: Option<&TargetIdentity>) -> String {
    let target = target
        .map(|target| target.release_target.clone())
        .unwrap_or_else(|| {
            format!(
                "unsupported-{}-{}-{}",
                std::env::consts::OS,
                std::env::consts::ARCH,
                if cfg!(target_env = "musl") {
                    "musl"
                } else {
                    "other"
                }
            )
        });
    format!("kasb:{}:stable:{target}", manifest.release.repository)
}

fn cache_directory() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("LOCALAPPDATA")
            .filter(|v| !v.is_empty())
            .map(|p| PathBuf::from(p).join("kasb/cache"))
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME")
            .filter(|v| !v.is_empty())
            .map(|p| PathBuf::from(p).join("Library/Caches/kasb"))
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        if let Some(path) = std::env::var_os("XDG_CACHE_HOME")
            .map(PathBuf::from)
            .filter(|p| p.is_absolute())
        {
            return Some(path.join("kasb"));
        }
        std::env::var_os("HOME")
            .filter(|v| !v.is_empty())
            .map(|p| PathBuf::from(p).join(".cache/kasb"))
    }
}

fn filename(key: &str, suffix: &str) -> String {
    format!("version-{:x}.{suffix}", Sha256::digest(key.as_bytes()))
}

fn check_deadline(deadline: &LocalBudget) -> Result<(), Problem> {
    if !deadline.active() {
        Err(Problem::CacheUnavailable)
    } else {
        Ok(())
    }
}

// Reject symlinks/reparse points at every existing component, including the
// user cache root. Never follow a leaf link when opening a record or lock.
fn check_directory(path: &Path, create: bool, deadline: &LocalBudget) -> Result<(), Problem> {
    if !path.is_absolute() {
        return Err(Problem::CacheUnavailable);
    }
    let mut current = PathBuf::new();
    let mut components = path.components().peekable();
    while let Some(component) = components.next() {
        check_deadline(deadline)?;
        current.push(component);
        // A Windows drive prefix is not a directory until RootDir is added;
        // probing a canonical prefix such as \\?\C: fails with ERROR_INVALID_FUNCTION.
        if matches!(component, std::path::Component::Prefix(_)) {
            if !matches!(components.peek(), Some(std::path::Component::RootDir)) {
                return Err(Problem::CacheUnavailable);
            }
            continue;
        }
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.is_dir() && !is_link(&metadata) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound && create => {
                match fs::create_dir(&current) {
                    Ok(()) => {}
                    Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
                    Err(_) => return Err(Problem::CacheUnavailable),
                }
                let metadata =
                    fs::symlink_metadata(&current).map_err(|_| Problem::CacheUnavailable)?;
                if !metadata.is_dir() || is_link(&metadata) {
                    return Err(Problem::CacheUnavailable);
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            _ => return Err(Problem::CacheUnavailable),
        }
    }
    Ok(())
}

fn is_link(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        metadata.file_type().is_symlink()
    }
}

fn open_regular(path: &Path, write: bool) -> Result<File, Problem> {
    let metadata = fs::symlink_metadata(path).map_err(|_| Problem::CacheUnavailable)?;
    if !metadata.is_file() || is_link(&metadata) {
        return Err(Problem::CacheInvalid);
    }
    let mut options = OpenOptions::new();
    options.read(true).write(write);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(
            (rustix::fs::OFlags::NOFOLLOW | rustix::fs::OFlags::NONBLOCK).bits() as i32,
        );
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(0x00200000);
    }
    let file = options.open(path).map_err(|_| Problem::CacheUnavailable)?;
    let metadata = file.metadata().map_err(|_| Problem::CacheUnavailable)?;
    if !metadata.is_file() || is_link(&metadata) {
        return Err(Problem::CacheInvalid);
    }
    Ok(file)
}

fn read_record(
    directory: &Path,
    key: &str,
    deadline: &LocalBudget,
) -> Result<CacheRecord, Problem> {
    check_deadline(deadline)?;
    let path = directory.join(filename(key, "json"));
    if matches!(fs::symlink_metadata(&path), Err(error) if error.kind() == std::io::ErrorKind::NotFound)
    {
        return Ok(CacheRecord::empty(key.to_owned()));
    }
    let file = open_regular(&path, false)?;
    if file
        .metadata()
        .map_err(|_| Problem::CacheUnavailable)?
        .len()
        > LIMIT as u64
    {
        return Err(Problem::CacheInvalid);
    }
    let mut bytes = Vec::new();
    file.take(LIMIT as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| Problem::CacheUnavailable)?;
    if bytes.len() > LIMIT {
        return Err(Problem::CacheInvalid);
    }
    let record: CacheRecord = serde_json::from_slice(&bytes).map_err(|_| Problem::CacheInvalid)?;
    if record.schema_version != SCHEMA || record.key != key {
        return Err(Problem::CacheInvalid);
    }
    Ok(record)
}

pub(crate) fn load(key: &str, deadline: &LocalBudget) -> Result<CacheRecord, Problem> {
    let directory = cache_directory().ok_or(Problem::CacheUnavailable)?;
    check_directory(&directory, false, deadline)?;
    read_record(&directory, key, deadline)
}

pub(crate) struct CacheLock {
    file: File,
    directory: PathBuf,
    key: String,
}

pub(crate) fn lock(key: &str, deadline: &LocalBudget) -> Result<Option<CacheLock>, Problem> {
    let directory = cache_directory().ok_or(Problem::CacheUnavailable)?;
    lock_directory(directory, key, deadline)
}

fn lock_directory(
    directory: PathBuf,
    key: &str,
    deadline: &LocalBudget,
) -> Result<Option<CacheLock>, Problem> {
    check_directory(&directory, true, deadline)?;
    let path = directory.join(filename(key, "lock"));
    // Publish a fully initialized lock atomically. An empty visible file would
    // let a concurrent first-use process misclassify an in-progress initializer
    // as corruption and perform an unlocked refresh.
    if matches!(fs::symlink_metadata(&path), Err(error) if error.kind() == std::io::ErrorKind::NotFound)
    {
        let mut staged =
            tempfile::NamedTempFile::new_in(&directory).map_err(|_| Problem::CacheUnavailable)?;
        staged
            .write_all(LOCK_HEADER)
            .map_err(|_| Problem::CacheUnavailable)?;
        check_deadline(deadline)?;
        match staged.persist_noclobber(&path) {
            Ok(_) => {}
            Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(_) => return Err(Problem::CacheUnavailable),
        }
    }
    check_deadline(deadline)?;
    let file = open_regular(&path, true)?;
    match FileExt::try_lock_exclusive(&file) {
        Ok(()) => {}
        Err(error) if error.raw_os_error() == fs2::lock_contended_error().raw_os_error() => {
            return Ok(None);
        }
        Err(_) => return Err(Problem::CacheUnavailable),
    }
    let mut bytes = Vec::new();
    (&file)
        .take(LOCK_HEADER.len() as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| Problem::CacheUnavailable)?;
    if bytes != LOCK_HEADER {
        return Err(Problem::CacheInvalid);
    }
    Ok(Some(CacheLock {
        file,
        directory,
        key: key.to_owned(),
    }))
}

pub(crate) fn reload(lock: &CacheLock, deadline: &LocalBudget) -> Result<CacheRecord, Problem> {
    read_record(&lock.directory, &lock.key, deadline)
}

pub(crate) fn save(
    record: &CacheRecord,
    lock: &CacheLock,
    deadline: &LocalBudget,
) -> Result<(), Problem> {
    check_deadline(deadline)?;
    if record.key != lock.key {
        return Err(Problem::CacheInvalid);
    }
    check_directory(&lock.directory, false, deadline)?;
    // A corrupt/foreign record is left untouched. A later schema owner may
    // still need it; temporary observations can serve this invocation only.
    read_record(&lock.directory, &lock.key, deadline)?;
    let bytes = serde_json::to_vec(record).map_err(|_| Problem::CacheInvalid)?;
    if bytes.len() > LIMIT {
        return Err(Problem::CacheInvalid);
    }
    let mut staged =
        tempfile::NamedTempFile::new_in(&lock.directory).map_err(|_| Problem::CacheUnavailable)?;
    staged
        .write_all(&bytes)
        .map_err(|_| Problem::CacheUnavailable)?;
    check_deadline(deadline)?;
    staged
        .persist(lock.directory.join(filename(&lock.key, "json")))
        .map_err(|_| Problem::CacheUnavailable)?;
    Ok(())
}

impl Drop for CacheLock {
    fn drop(&mut self) {
        let _ = FileExt::unlock(&self.file);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn deadline() -> LocalBudget {
        LocalBudget::new(
            Instant::now() + std::time::Duration::from_secs(5),
            kasb::http::CancellationToken::new(),
        )
    }
    fn directory() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    #[cfg(windows)]
    #[test]
    fn canonical_windows_directories_are_checked_after_the_drive_root() {
        let temp = directory();
        let canonical = fs::canonicalize(temp.path()).unwrap();
        let prefix = canonical.components().next().unwrap();
        assert!(matches!(prefix, std::path::Component::Prefix(_)));
        assert!(check_directory(Path::new(prefix.as_os_str()), false, &deadline()).is_err());
        check_directory(&canonical, false, &deadline()).unwrap();
        let child = canonical.join("cache");
        check_directory(&child, true, &deadline()).unwrap();
        assert!(child.is_dir());
    }

    #[test]
    fn concurrent_first_use_never_observes_a_partial_lock_header() {
        let temp = directory();
        let directory = fs::canonicalize(temp.path()).unwrap();
        let start = std::sync::Arc::new(std::sync::Barrier::new(8));
        let finish = std::sync::Arc::new(std::sync::Barrier::new(8));
        let workers = (0..8)
            .map(|_| {
                let directory = directory.clone();
                let start = start.clone();
                let finish = finish.clone();
                std::thread::spawn(move || {
                    start.wait();
                    let lock = lock_directory(directory, "key", &deadline());
                    finish.wait();
                    assert!(
                        lock.is_ok(),
                        "an initialized or contended lock is never corrupt"
                    );
                    lock.unwrap().is_some()
                })
            })
            .collect::<Vec<_>>();
        assert_eq!(
            workers
                .into_iter()
                .map(|worker| worker.join().unwrap())
                .filter(|locked| *locked)
                .count(),
            1
        );
    }

    #[test]
    fn crashed_unpublished_initializer_does_not_poison_the_lock() {
        let temp = directory();
        let directory = fs::canonicalize(temp.path()).unwrap();
        let mut staged = tempfile::NamedTempFile::new_in(&directory).unwrap();
        staged.write_all(b"partial header").unwrap();
        // Simulate a crash leaving only the private staging file behind.
        let (_file, _path) = staged.keep().unwrap();
        let lock = lock_directory(directory, "key", &deadline()).unwrap();
        assert!(lock.is_some());
    }

    #[test]
    fn a_blocked_disk_worker_cannot_publish_after_cancellation() {
        let temp = directory();
        let directory = fs::canonicalize(temp.path()).unwrap();
        let token = kasb::http::CancellationToken::new();
        let budget = LocalBudget::new(
            Instant::now() + std::time::Duration::from_secs(5),
            token.clone(),
        );
        let lock = lock_directory(directory.clone(), "key", &budget)
            .unwrap()
            .unwrap();
        let (resume, blocked) = std::sync::mpsc::channel();
        let worker = std::thread::spawn(move || {
            blocked.recv().unwrap();
            save(&CacheRecord::empty("key".into()), &lock, &budget)
        });
        token.cancel();
        resume.send(()).unwrap();
        assert!(worker.join().unwrap().is_err());
        assert!(!directory.join(filename("key", "json")).exists());
    }

    #[test]
    fn lock_is_nonblocking_and_released_when_the_handle_closes() {
        let temp = directory();
        let directory = fs::canonicalize(temp.path()).unwrap();
        let lock = lock_directory(directory.clone(), "key", &deadline())
            .unwrap()
            .unwrap();
        assert!(
            lock_directory(directory.clone(), "key", &deadline())
                .unwrap()
                .is_none()
        );
        drop(lock);
        assert!(
            lock_directory(directory, "key", &deadline())
                .unwrap()
                .is_some()
        );
    }

    #[test]
    fn atomic_records_keep_observation_and_failed_attempt_times_separate() {
        let temp = directory();
        let directory = fs::canonicalize(temp.path()).unwrap();
        let lock = lock_directory(directory.clone(), "key", &deadline())
            .unwrap()
            .unwrap();
        let mut record = CacheRecord::empty("key".into());
        record.observation = Some(Observation {
            observed_at: 100,
            release: None,
            distribution: Distribution::Unknown,
        });
        save(&record, &lock, &deadline()).unwrap();
        record.failed_at = Some(200);
        save(&record, &lock, &deadline()).unwrap();
        let loaded = read_record(&directory, "key", &deadline()).unwrap();
        assert_eq!(loaded.observation.unwrap().observed_at, 100);
        assert_eq!(loaded.failed_at, Some(200));
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 2);
    }

    #[test]
    fn foreign_corrupt_and_oversized_records_are_not_overwritten() {
        let temp = directory();
        let directory = fs::canonicalize(temp.path()).unwrap();
        let lock = lock_directory(directory.clone(), "key", &deadline())
            .unwrap()
            .unwrap();
        let path = directory.join(filename("key", "json"));
        for bytes in [
            b"unrelated user file".to_vec(),
            vec![b'x'; LIMIT + 1],
            serde_json::to_vec(&CacheRecord::empty("foreign".into())).unwrap(),
        ] {
            fs::write(&path, &bytes).unwrap();
            assert!(read_record(&directory, "key", &deadline()).is_err());
            assert!(save(&CacheRecord::empty("key".into()), &lock, &deadline()).is_err());
            assert_eq!(fs::read(&path).unwrap(), bytes);
        }
    }

    #[test]
    fn foreign_lock_file_is_not_modified() {
        let temp = directory();
        let directory = fs::canonicalize(temp.path()).unwrap();
        let path = directory.join(filename("key", "lock"));
        fs::write(&path, b"unrelated").unwrap();
        assert!(lock_directory(directory, "key", &deadline()).is_err());
        assert_eq!(fs::read(path).unwrap(), b"unrelated");
    }

    #[test]
    fn deadline_prevents_cache_creation_or_replacement() {
        let temp = directory();
        let directory = fs::canonicalize(temp.path()).unwrap();
        assert!(
            lock_directory(
                directory.clone(),
                "key",
                &LocalBudget::new(Instant::now(), kasb::http::CancellationToken::new())
            )
            .is_err()
        );
        assert_eq!(fs::read_dir(directory).unwrap().count(), 0);
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_directories_records_and_locks_are_rejected() {
        use std::os::unix::fs::symlink;
        let temp = directory();
        let directory = fs::canonicalize(temp.path()).unwrap();
        let outside = directory.join("outside");
        fs::create_dir(&outside).unwrap();
        let linked = directory.join("linked");
        symlink(&outside, &linked).unwrap();
        assert!(lock_directory(linked, "key", &deadline()).is_err());
        let path = directory.join(filename("key", "json"));
        let external = outside.join("file");
        fs::write(&external, b"untouched").unwrap();
        symlink(&external, &path).unwrap();
        assert!(read_record(&directory, "key", &deadline()).is_err());
        let lock_path = directory.join(filename("key", "lock"));
        symlink(&external, &lock_path).unwrap();
        assert!(lock_directory(directory, "key", &deadline()).is_err());
        assert_eq!(fs::read(external).unwrap(), b"untouched");
    }
}
