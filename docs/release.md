# Release posture

Standalone Rust CLI releases are available through immutable GitHub Releases
from the public canonical repository `cpaikr/kasb`. The first Rust/Node product
release is [v0.3.3](https://github.com/cpaikr/kasb/releases/tag/v0.3.3).
[The completed first-release task](../tasks/perform-first-rust-node-release.md)
records its publication and validation evidence.

## Identity authorities

`[workspace.package].version` in `Cargo.toml` is the canonical product version.
Product releases must exceed the retired product's `0.2.1` version floor.
The strict workflow rechecks publication state before mutation.

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
The Windows candidate job also runs native upgrade rollback/crash tests,
CLI lints, and PowerShell installer behavior tests.

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

GitHub Releases are the only implemented publication channel. The Node SDK,
npm-format package assembly, tarballs, and clean-consumer tests remain part of
CI candidate verification. Those packages are not GitHub Release assets; the
pipeline has no npm registry publisher, registry-state checks, or dormant npm
publication job. Adding registry distribution requires a new product decision
and implementation.

Before publication, an operator must verify that `cpaikr/kasb` is public and
repository release immutability is enabled. Use read-only queries with an
operator credential permitted to inspect repository settings:

```bash
gh repo view cpaikr/kasb --json visibility
gh api repos/cpaikr/kasb/immutable-releases --jq .enabled
```

The strict workflow validates the canonical tag and its source commit, checks
GitHub release history, and requires the release state to be vacant or an exact
resumable match. The retired-product version floor remains part of the product
identity contract.

GitHub publication uses the workflow job token with `contents: write` only in
the publication job. It requires no `github-release` environment, sentinel,
or policy App credential. Source validation checks that the tag matches the
Cargo version, identifies the checkout, and belongs to `origin/main` history.
The job token cannot inspect the Administration API's repository immutability
setting. Enabling it remains an operator prerequisite; the executor verifies
the actual final release is immutable before reporting success.

If immutability was not enabled, publication may already have occurred when
that verification fails. Preserve the published tag and bytes, stop retrying
that version, and recover with a separately authorized new version after
correcting the prerequisite. A failed final verification is not a successful
release or permission to overwrite assets.

## Local release preparation

Use Bun 1.3.13, Node 24, Rust 1.88, and cargo-about 0.9.2. Install dependencies
with `bun install --frozen-lockfile` and `cargo fetch --locked` before preparation.

After separate publication authorization, run `bun run release` from a clean
`main` checkout tracking `origin/main`. The `before:init` hook fetches upstream
and rejects a checkout that differs from the freshly fetched branch. The local
`release-it` flow selects an increased stable version from Cargo metadata,
synchronizes Cargo dependencies and lockfile, npm metadata and lockfile,
installers and notices, and updates `CHANGELOG.md` from conventional commits.
The `after:bump` hooks check identities and run `bun run verify` before the
release commit, canonical `v<version>` tag, and push.

The local tool does not publish packages or create a GitHub Release directly.
Pushing the tag starts strict CI publication, so running the complete release
command requires publication authorization.

## CI platform coverage

Routine `ci.yml` verification runs only on Linux GNU x64. Every tag-triggered
release and manual rehearsal builds and verifies Linux GNU x64/ARM64, macOS
ARM64, and Windows x64 through the same candidate workflow. PRs, branch pushes,
and schedules do not start the full matrix.

Pushing a canonical `v*` tag invokes strict publication in `release.yml` after
source validation and all candidate gates pass. Manual dispatch of either
`candidate.yml` or `release.yml` is always a non-publishing rehearsal, including
when dispatched against a tag. Both workflow files must exist on the default
branch for GitHub to accept manual dispatch.

This scheduling policy retains economical continuous validation and full
release evidence. `bun run native:check` enforces permitted entry points and
static runner matrices, including regression tests for automatic cross-platform
callers. Linux container builds retain GitHub-hosted runners for the credential
isolation reason documented above.

## Non-publishing candidate verification

The canonical rehearsal must build the Linux GNU x64/ARM64, macOS ARM64, and
Windows x64 candidates from one checkout and exercise the same metadata,
artifact, installer, receipt, upgrade, provenance, and clean-consumer contracts
used by strict publication. The validated candidate includes every native npm
tarball, the root npm tarball, all four standalone archives, `SHA256SUMS`, both
generated installers, and bounded provenance. Its sealed Actions artifact also
carries an internal raw artifact manifest and the validated `candidate.json`
receipt that binds every candidate byte to the source commit. Neither internal
file is part of the GitHub Release.

Rehearsal substitutes only an unmistakable synthetic candidate ref and
deterministic publication-state fixtures. It has no release-write permission
or path to a live publication step. Failure injection proves that incomplete
target sets, failed prerequisites, interrupted uploads, non-immutable release
metadata, and occupied asset mismatches fail closed. Exact draft assets may be
reused; an already-published release must match the complete candidate and be
immutable.

Strict publication, when separately authorized, consumes the validated
candidate without rebuilding it. Repository release immutability must already
be enabled. One non-cancelling concurrency group serializes every release
version. The workflow stages a draft, uploads and verifies the complete GitHub
asset set, publishes it, and verifies its immutable final state. Resume uses
the original validated Actions artifact: rerun only the failed publication job
while that artifact remains retained. An expired or unavailable artifact fails
closed and must not be replaced by a rebuild for the same partially published
version.

Download and inspect the GitHub publication receipt before any retry. A
published release that failed the immutability check requires the new-version
recovery described above. `not_started` means the job failed before entering
its mutation executor; `outcome_unknown` means the executor may have reached
GitHub; and a completed failure receipt records the operations already
reconciled. For recoverable failures, use GitHub Actions' **Re-run failed jobs**
operation so the sealed candidate is not rebuilt. The retry reconciles the
draft, assets, and immutable final state. Never delete or replace a published
tag or release asset to recover.

The current candidate and strict-state artifacts are retained for seven days.
If either expires, stop. A version with no published external state may proceed
only under a newly authorized release attempt; a partially published version
requires an explicit recovery decision because this pipeline will neither
rebuild its missing bytes nor overwrite external state.
