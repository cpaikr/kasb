# Release posture

The repository defines and validates a release contract but does not publish
it. Registry publication, production-version selection, source tags, GitHub
Releases, and repository visibility changes require separate authorization.
`cpaikr/kasb` is currently private, so it cannot yet serve unauthenticated
standalone installs or upgrades.

## Identity authorities

`[workspace.package].version` in `Cargo.toml` is the canonical product version.
The current `0.1.0` value is a development identity, not the selected first
production release; that release must use an unpublished version newer than
the retired npm product's `0.2.1`.

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
PowerShell installer on `windows-2025`; this is protocol evidence, not a native
package support claim.

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
The repository may implement and rehearse the automation needed to establish
that evidence, but doing so performs no release and grants no publication
authority.

## Publication prerequisites and authority

Before a separately authorized first release, an operator must verify all of
the following external state rather than infer it from a passing build:

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

## Non-publishing candidate verification

The canonical rehearsal must build the Linux GNU x64/ARM64, macOS ARM64, and
Windows x64 candidates from one checkout and exercise the same metadata,
artifact, installer, receipt, upgrade, provenance, and clean-consumer contracts
used by strict publication. The validated candidate includes every native npm
tarball, the root npm tarball, all four standalone archives, `SHA256SUMS`, both
generated installers, and bounded provenance.

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
be enabled. The workflow stages a draft, uploads and verifies the complete
GitHub asset set, and only then publishes it. It next re-verifies the immutable
state, tag, commit, and asset set before publishing native npm packages followed
by the exact-version root package. Any partial publication is reported
truthfully and resumed only after byte-for-byte identity checks. These operator
contracts do not authorize running that path.
