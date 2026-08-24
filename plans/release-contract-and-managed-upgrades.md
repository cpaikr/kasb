# Establish the release, installation, and managed-upgrade contract

## Outcome

KASB has one enforceable release identity and one target-derived artifact and
installation contract. Standalone CLI users can install a checksummed GitHub
Release asset, inspect available upgrades, and upgrade recoverably, while npm
installations remain owned by npm and continue to launch the same-revision Rust
binary without runtime addon downloads.

## Current state

- The implementation branch makes Cargo workspace version `0.1.0` the current
  development identity and derives the npm root, four native packages, archive
  names, CLI identity, installers, checksums, and receipts from it. The first
  production version remains deliberately unselected and must be newer than
  the occupied retired-product version `0.2.1`.
- `native-targets.json` owns the four supported targets plus release repository,
  archive, bound, installer-selection, and receipt policy. Repository checks
  reject derived identity or generated-file skew.
- Generated POSIX and PowerShell installers and receipt-managed CLI upgrade
  behavior are implemented with bounded discovery, checksum and executable
  verification, recoverable replacement, and ordinary-command isolation.
- Local deterministic, installer, Rust, Node, formatting, clippy, license, and
  freshness validation passes. PowerShell behavioral execution is required in
  CI because the local macOS host does not provide `pwsh`.
- `cpaikr/kasb` is currently private. Its release assets cannot be the
  unauthenticated canonical installation source until the separately
  authorized visibility change makes that repository public.
- The approved direction adopts the accepted `../mytech` standalone CLI
  distribution guidance, including `upgrade --check` and recoverable
  `upgrade`. This is an intentional exception to the previous blanket
  no-runtime-download posture.

## Decisions

- Publicly accessible GitHub Releases are the canonical standalone CLI source.
  Repository release immutability must lock the associated tag and assets after
  publication; installers and upgrades reject release metadata that is not
  marked immutable, and corrections use a new version.
- `cpaikr/kasb` is the single canonical source and release repository. This
  work binds artifacts, installers, receipts, provenance, and upgrade discovery
  to that identity without changing its visibility; public visibility remains
  a separately authorized first-release prerequisite.
- One canonical product version must reconcile the source tag, Rust workspace,
  npm root, native npm packages, CLI-reported version, archive names, and release
  metadata. The first Rust/Node release must use an unpublished version newer
  than `0.2.1`; this plan does not select it.
- `native-targets.json` remains the target authority and will also drive archive
  identities, SHA-256 entries, and shell and PowerShell platform selection.
- Installers require no repository clone, language toolchain, package manager,
  or GitHub CLI. They verify the selected archive checksum before installation.
- A standalone installation receipt records the version, target, executable,
  canonical release source, and installed digest. Managed upgrade is allowed
  only when the current executable and receipt agree.
- `upgrade --check` is side-effect-free apart from bounded network access and
  local cache/receipt reads. `upgrade` verifies release metadata, checksum, and
  executable identity; stages on the destination filesystem; and replaces the
  executable and receipt recoverably.
- npm, source-built, and otherwise externally managed executables are not
  self-replaced. They return actionable guidance to their owning installation
  method.
- Ordinary commands never wait for an update lookup, change exit status because
  of one, or emit update notices. Automatic and background update checks are not
  part of this plan.
- The npm launcher still performs no download, compilation, command parsing, or
  fallback implementation. Managed standalone CLI upgrades are the only newly
  approved runtime download path.

## Scope

- Choose and enforce the canonical version source; generate or reconcile every
  derived version and reject tag, checkout, package, archive, or binary skew.
- Bind release discovery, receipts, installers, provenance, and validation to
  `cpaikr/kasb`, with no second release repository or duplicated tag authority.
- Add stable CLI version discovery suitable for installer and upgrade identity
  checks.
- Extend the target model and generators for versioned archives, a checksum
  manifest, shell and PowerShell installers, and a versioned receipt schema.
- Define bounded GitHub Release discovery and download behavior, including
  redirects, timeouts, response sizes, immutable-release verification,
  unsupported targets, missing assets, and rate-limit or network failures.
- Implement `upgrade --check` and `upgrade` with explicit structured failures,
  same-filesystem staging, digest verification, rollback, and truthful recovery
  state.
- Define and test the Windows replacement protocol before claiming recoverable
  self-upgrade for the supported Windows target.
- Keep installer and upgrade logic independent from KASB provider transport and
  preserve the existing Rust SDK, Node binding, npm launcher, and CLI behavior
  boundaries.
- Reconcile `ARCHITECTURE.md`, `VISION.md`, `README.md`, CLI documentation, and
  `docs/release.md` with the approved standalone download exception.

## Validation

- Freshness checks prove that version, target, asset, installer, and receipt
  derivatives match their canonical inputs with exact identity coverage.
- Installer tests exercise target selection, checksum verification, receipt
  creation, paths with spaces, unsupported targets, corrupt downloads, and
  interrupted installation without contacting KASB.
- Upgrade tests cover no-update, available-update, unmanaged installation,
  receipt or executable mismatch, missing assets, checksum mismatch, staging
  failure, replacement failure, receipt-write failure, rollback success, and
  unrecoverable-state reporting.
- CI and other noninteractive ordinary commands make no update-check network
  request and preserve stdout, stderr, and exit behavior.
- Exact standalone binaries remain byte-identical to the CLI binaries carried
  by their corresponding npm platform packages.

## Completion criteria

- Cargo workspace metadata is the canonical product-version source, and a
  repository-owned freshness gate rejects every Cargo, npm, generated package,
  binary, archive, installer, checksum, receipt, and release-metadata skew.
- `native-targets.json` derives the complete four-target standalone asset,
  checksum, installer-selection, and receipt identities without duplicating the
  target matrix elsewhere.
- Shell and PowerShell installer tests pass for every specified success and
  failure path, and their installed binaries and receipts satisfy the canonical
  identity and digest checks.
- `kasb --version`, `kasb upgrade --check`, and recoverable `kasb upgrade`
  satisfy the managed/unmanaged, rollback, Windows replacement, network-bound,
  immutable-release, and ordinary-command isolation contracts in deterministic
  tests.
- Architecture, product, CLI, and release documentation describe the same
  standalone/npm ownership boundary, current private-host prerequisite, and
  separately authorized production release.
- Repository-required validation and review pass, the implementation PR is
  merged, and this plan leaves `ROADMAP.md` Current only after those gates are
  recorded truthfully.

## Next action

Finish PR #22's CI and review, merge it into the goal integration branch,
record the evidence, and then promote the four-target release-pipeline plan to
Current.
