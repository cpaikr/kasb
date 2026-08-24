# Establish the release, installation, and managed-upgrade contract

## Outcome

KASB has one enforceable release identity and one target-derived artifact and
installation contract. Standalone CLI users can install a checksummed GitHub
Release asset, inspect available upgrades, and upgrade recoverably, while npm
installations remain owned by npm and continue to launch the same-revision Rust
binary without runtime addon downloads.

## Current state

- `native-targets.json` owns four supported native targets and drives generated
  npm platform metadata, but it does not yet own release asset names or
  installers.
- The npm root and generated native packages use version `0.2.1`, which is
  already occupied in npm by the retired TypeScript/Pi product. The Rust
  workspace uses version `0.1.0`.
- Existing assembly and validation prove that each npm platform package and its
  direct CLI archive contain the same Rust CLI binary. No shipped checksum
  manifest, installer, installation receipt, CLI product-version command, or
  upgrade operation exists.
- `cpaikr/kasb` is currently private. Its release assets cannot be the
  unauthenticated canonical installation source unless the repository becomes
  public or a separate public GitHub release repository is designated.
- The approved direction adopts the accepted `../mytech` standalone CLI
  distribution guidance, including `upgrade --check` and recoverable
  `upgrade`. This is an intentional exception to the previous blanket
  no-runtime-download posture.

## Decisions

- Publicly accessible GitHub Releases are the canonical standalone CLI source.
  Tags and published assets are immutable; corrections use a new version.
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
- Decide whether `cpaikr/kasb` becomes public or a separate public release
  repository owns the canonical assets, then keep release discovery, receipts,
  installers, and provenance bound to that single host identity.
- Add stable CLI version discovery suitable for installer and upgrade identity
  checks.
- Extend the target model and generators for versioned archives, a checksum
  manifest, shell and PowerShell installers, and a versioned receipt schema.
- Define bounded GitHub Release discovery and download behavior, including
  redirects, timeouts, response sizes, unsupported targets, missing assets, and
  rate-limit or network failures.
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

## Next action

Choose the canonical product-version source—prefer the Cargo workspace version
unless a dedicated release manifest proves simpler—and add a repository-owned
validator that rejects the current Cargo/npm/version-tag skew before extending
artifact or upgrade behavior.
