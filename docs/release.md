# Release posture

The first Rust/Node release is being prepared as GitHub-only version `0.3.0`.
`cpaikr/kasb` remains private until the authorized privacy audit and log
remediation are complete. Publication status and remaining setup are tracked in
[the first-release task](../tasks/perform-first-rust-node-release.md).

## Identity authorities

`[workspace.package].version` in `Cargo.toml` is the canonical product version.
The selected `0.3.0` identity is newer than the retired npm product's `0.2.1`.
The strict workflow rechecks vacancy immediately before publication.

`native-targets.json` owns the canonical repository, tag prefix, bounds,
receipt schema, and four-target matrix. Generators derive exact npm versions,
installer selection, and standalone names:

```text
kasb-<version>-linux-x64-gnu.tar.gz
kasb-<version>-linux-arm64-gnu.tar.gz
kasb-<version>-darwin-arm64.tar.gz
kasb-<version>-win32-x64-msvc.tar.gz
SHA256SUMS
```

Each archive contains exactly one CLI binary, identical to the executable in
its corresponding npm platform package. `bun run release:check` rejects Cargo,
npm, target, archive-name, installer, receipt-policy, CLI-version, and optional
supplied release-metadata skew. `bun run native:artifacts` validates the
assembled npm packages, archive contents, checksums, and cross-format binary
identity. `bun run test:installers` exercises the generated installers without
a KASB request or public release.

## Standalone ownership and trust

The POSIX and PowerShell installers select only a declared target, use bounded
requests, reject non-HTTPS/noncanonical sources outside an explicit test gate,
require an immutable exact-tag release, and verify the archive against its
single exact SHA-256 entry. Installation publishes the executable and adjacent
`.kasb-receipt.json` recoverably. The receipt records schema and manager,
version, target, executable path, canonical repository and tag, asset name, and
installed executable digest. The PowerShell path streams and extracts the
archive through .NET and does not depend on an external `tar` executable.
CI compiles the Windows-only upgrade path and executes the generated
PowerShell installer on `blacksmith-2vcpu-windows-2025`; this is protocol
evidence, not a native package support claim.

`kasb upgrade --check` performs bounded discovery only. `kasb upgrade` proceeds
only when the current executable and receipt agree, then verifies immutable
release metadata, exact asset identity and size, checksums, archive shape, and
the staged executable's `kasb <version>` identity. POSIX replacement rolls the
binary and receipt back together on failure. Windows schedules a helper that
waits for the running executable to exit, applies or rolls back both files, and
records a terminal status; scheduling is not reported as an applied upgrade.

npm, Cargo/source, missing-receipt, and receipt/digest-mismatched installations
remain owned by their installation method. Ordinary KASB commands never check
for updates or change behavior because an update exists.

## Required evidence before publication

A separately authorized release still requires an unoccupied production
version, public canonical repository access, repository release immutability,
fresh native evidence for every claimed target, contracts and adversarial
conformance, Rust/Node/CLI tests, ABI-floor and clean-consumer checks, license
checks, and aggregate validation of the exact npm and standalone artifacts.
Linux container builds use GitHub-hosted runners with pinned manylinux images:
Blacksmith container initialization exposed runner credentials before workflow
steps could mask them. Other native runners retain their established mapping.
The repository may implement and rehearse the automation needed to establish
that evidence, but doing so performs no release and grants no publication
authority.

## Publication prerequisites and authority

The first Rust/Node release is authorized for GitHub only. The `npm-release`
job is explicitly disabled and workflow validation enforces that guard. npm
publication requires a separately authorized, reviewed change to re-enable
that job. Candidate assembly and read-only npm identity checks still run so
the common version and artifact contract remains intact.

Before the first release, an operator must verify all of
the applicable external state rather than infer it from a passing build.
The npm environment and trusted-publisher requirements below apply only when
npm publication is separately enabled:

- `cpaikr/kasb` is public so canonical release metadata and assets are available
  to unauthenticated installers and managed upgrades.
- Repository release immutability is enabled and the publication path verifies
  the final release as immutable before npm publication. Published tags and
  assets are never moved or replaced; a correction uses a new version.
- The `github-release` environment limits deployment to canonical release refs
  through required reviewers and deployment rules configured outside the
  repository. It defines `KASB_GITHUB_RELEASE_SENTINEL` with the exact value
  `github-release:v1`; that secret must not exist at repository or organization
  scope. It also holds environment secret `KASB_RELEASE_APP_PRIVATE_KEY` and
  defines environment variable `KASB_RELEASE_APP_CLIENT_ID`. Those values
  identify a GitHub App installation limited to `cpaikr/kasb`; the App has
  repository Administration read and Contents read permissions and no write
  permission. The workflow mints a short-lived token in the preflight and again
  immediately before GitHub mutation, so each live state read proves repository
  release immutability is still enabled.
- The separate `npm-release` environment has the same reviewer and canonical
  ref restrictions and defines environment-only secret
  `KASB_NPM_RELEASE_SENTINEL=npm-release:v1`. Missing sentinels stop each job
  before mutation, so GitHub's automatic creation of an unconfigured
  environment cannot silently authorize publication.
- npm trusted publishers are registered for the root package and each native
  package against that exact GitHub repository, the final top-level workflow
  filename `.github/workflows/release.yml`, and the exact `npm-release`
  environment name used by this project. The environment binding is required,
  not optional. Each new registration must select whether it allows
  `npm publish`, staged publish, or both.
  Publication uses a GitHub-hosted runner with `id-token: write` scoped to the
  npm job and no retained npm token; the repository and package must be public
  for provenance.
- A production version newer than the occupied retired-product version `0.2.1`
  has been explicitly authorized and remains vacant or is an exact resumable
  match. This document does not select that version or authorize its tag.

Configuration or mutation of those prerequisites is outside the
release-readiness goal. A passing rehearsal reports readiness only; it must not
change repository visibility, environment protection, trusted-publisher
registration, tags, releases, or registry state.

Before approving a separately authorized production run, inspect the external
gates with read-only queries. Set the intended version locally; do not create a
tag as part of this verification:

```bash
KASB_RELEASE_VERSION='<authorized-version>'
gh repo view cpaikr/kasb --json visibility
gh api repos/cpaikr/kasb/immutable-releases --jq .enabled
gh api repos/cpaikr/kasb/environments/github-release
gh api repos/cpaikr/kasb/environments/npm-release
npm view "@sjunepark/kasb@${KASB_RELEASE_VERSION}" dist.tarball --json
```

Repeat the final `npm view` check for every native package named in
`native-targets.json`. A not-found result is the expected vacant state; an
existing version is acceptable only when the guarded workflow proves its
tarball is byte-for-byte identical to the sealed candidate. Confirm the
environment-only sentinels, GitHub App scope, reviewers, deployment rules, and
npm trusted-publisher bindings in their provider settings because read-only
repository metadata does not reveal every secret or publisher constraint.

## Non-publishing candidate verification

The canonical rehearsal must build the Linux GNU x64/ARM64, macOS ARM64, and
Windows x64 candidates from one checkout and exercise the same metadata,
artifact, installer, receipt, upgrade, provenance, and clean-consumer contracts
used by strict publication. The validated candidate includes every native npm
tarball, the root npm tarball, all four standalone archives, `SHA256SUMS`, both
generated installers, and bounded provenance. Its sealed Actions artifact also
carries an internal raw artifact manifest and the validated `candidate.json`
receipt that binds every candidate byte to the source commit. Neither internal
file is part of the GitHub Release or npm projections.

Rehearsal substitutes only an unmistakable synthetic candidate ref and
deterministic publication-state fixtures. It must have no release-write
permission, protected-environment access, npm publishing identity, or path to a
live publication step. Failure injection must prove that incomplete target
sets, failed prerequisites, interrupted upload state, non-immutable release
metadata, occupied mismatches, partial npm publication, and root-package
failure stop closed while exact already-published tarballs are the only
resumable registry state.

Strict publication, when separately authorized, consumes the already validated
candidate without rebuilding it. Repository release immutability must already
be enabled. One non-cancelling concurrency group serializes every release
version. The workflow stages a draft, uploads and verifies the complete GitHub
asset set, and only then publishes it. When npm publication is separately
enabled, it re-verifies the immutable state, tag, commit, and asset set before
publishing native npm packages followed
by the exact-version root package. Any partial publication is reported
truthfully and resumed only after byte-for-byte identity checks. These operator
contracts do not authorize running that path. Resume uses the original
validated Actions artifact: rerun only the failed publication job while that
artifact remains retained. An expired or unavailable artifact fails closed and
must not be replaced by a rebuild for the same partially published version.

Download and inspect the channel receipt before any retry. `not_started` means
the job failed before entering its mutation executor; `outcome_unknown` means
the executor may have reached an external service; and a completed failure
receipt records the operations already reconciled. In every case use GitHub
Actions' **Re-run failed jobs** operation so successful publication jobs and
the sealed candidate are not rebuilt. If GitHub publication failed, the retry
reconciles the draft, assets, and immutable final state before npm can run. If
only npm failed, retry only that failed job; it first re-verifies GitHub and
then accepts only exact already-published tarballs before continuing native
packages and finally the root package. Never delete or replace a published tag,
release asset, or package to recover.

The current candidate and strict-state artifacts are retained for seven days.
If either expires, stop. A version with no published external state may proceed
only under a newly authorized release attempt; a partially published version
requires an explicit recovery decision because this pipeline will neither
rebuild its missing bytes nor overwrite external state.
