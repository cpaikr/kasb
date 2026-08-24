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
This slice adds no publication workflow and performs no release.
