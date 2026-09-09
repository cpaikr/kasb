# kasb

Read-only access to KASB standards and Q&A material through a public Rust SDK,
Rust-backed Node SDK, and Rust CLI.

KASB has one implementation of provider transport and domain behavior:
`crates/kasb`. The first-class Rust CLI uses that SDK directly, and the Node SDK
uses it through an asynchronous Node-API binding. The npm `kasb` executable is
only a transparent launcher for the packaged Rust CLI binary.

See [ARCHITECTURE.md](ARCHITECTURE.md) for component boundaries,
[VISION.md](VISION.md) for product scope, and [MIGRATION.md](MIGRATION.md) for
the completed rewrite decision.

## Install the CLI

The standalone CLI needs no Node.js or Rust installation. Download the latest
stable release using the installer for your platform, or browse the
[release assets](https://github.com/cpaikr/kasb/releases/latest).

### macOS and Linux

Supports Apple Silicon Macs and Linux x64/ARM64 with glibc 2.28 or newer.
The installer uses `curl`, `tar`, `gzip`, and `sha256sum` or `shasum`.

```sh
curl -fsSL https://github.com/cpaikr/kasb/releases/latest/download/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
kasb --version
kasb --help
```

The default install directory is `~/.local/bin`. Add the `export PATH` line to
your shell profile to make it available in new terminals.

### Windows

Run in PowerShell 5.1 or newer on Windows x64, from an ordinary terminal
opened independently of a packaged desktop agent:

```powershell
Invoke-RestMethod https://github.com/cpaikr/kasb/releases/latest/download/install.ps1 | Invoke-Expression
```

The default install directory is `%LOCALAPPDATA%\kasb\bin`. Set
`KASB_INSTALL_DIR` before installing to choose another directory. Follow the
[Windows PATH setup and verification](docs/windows-installation.md#register-persistent-user-path)
to register that selected directory persistently, update the current session
separately, and verify full-path execution and `kasb --version` / `kasb --help`
in both current and newly opened ordinary terminals.

If the installer sees the executable but your terminal cannot see the same full
path, use [Windows installation recovery](docs/windows-installation.md#choose-a-visible-destination).
Packaged apps can redirect AppData writes; restarting a shell or changing PATH
alone cannot make a privately stored file visible.

### Upgrade

Both installers verify release checksums and create an adjacent ownership
receipt. Set `KASB_INSTALL_DIR` in your environment before installing to choose
a different directory, and add that directory to `PATH`. Keep
`.kasb-receipt.json` beside the executable so managed upgrades work.

```sh
kasb upgrade --check
kasb upgrade
```

`upgrade --check` checks a managed installation; `upgrade` starts its upgrade.
On Windows, replacement finishes after the command exits. See
[release posture](docs/release.md#standalone-ownership-and-trust) for ownership
and verification details.

This checkout also implements `kasb version-check [--refresh]` for any
installation and cached JSON advisories after successful content commands.
These additions await the next release. The
[CLI contract](crates/kasb-cli/README.md#output-and-version-advisories) describes
output, latency, caching, and opt-outs.

## System shape

- [`crates/kasb`](crates/kasb/README.md) is the public Rust SDK and sole KASB
  conformer for all six v1 operations.
- [`crates/kasb-cli`](crates/kasb-cli) is the Rust `clap` CLI over that SDK.
- [`crates/kasb-node`](crates/kasb-node) and
  [`packages/node`](packages/node/README.md) provide the asynchronous Node-API
  projection, Node SDK, neutral toolset, and npm CLI launcher.
- [`packages/native`](packages/native) contains exact-version platform package
  metadata. Each target package carries the Node addon and same-revision Rust
  CLI binary.
- `contracts/kasb/openapi.yaml` owns supported provider wire facts.
  `docs/specs/kasb-standards-v1.md` owns public semantics.
- `fixtures/` and `conformance/` provide independent evidence and a
  process-isolated adversarial judge for the Rust SDK, Rust CLI, and Node SDK.

The supported npm native targets are Linux GNU x64/ARM64, macOS ARM64, and
Windows x64. The Linux GNU packages require glibc 2.28 or newer. The launcher
preserves POSIX signal identity where supported; Windows preserves termination
without claiming POSIX signal identity. Routine CI covers Linux GNU x64;
tag-triggered releases and manual rehearsals verify all four targets. See
[CI platform coverage](docs/release.md#ci-platform-coverage).

## Development commands

```sh
bun install --frozen-lockfile
bun run contracts:check
bun run conformance:judge
bun run native:feasibility
bun run typecheck
bun run test
bun run build
cargo fmt --all --check
cargo clippy --locked --workspace --all-targets -- -D warnings
```

`bun run verify` runs the complete local release verification sequence.
`bun run native:feasibility` exercises the current host. The cross-platform
support claim is backed by native builds, immutable packed consumers, direct
CLI archives, and aggregate artifact validation recorded in
[the rewrite plan](plans/rust-node-rewrite.md).

Use `cargo run --locked -p kasb-cli --bin kasb -- --help` for the direct Rust
CLI. After `bun run build:node`, `node packages/node/dist/cli.js --help`
exercises the npm launcher path when the matching native package is installed.
Live KASB checks are opt-in through `bun run test:live` because upstream
behavior can drift.

The npm runtime floor is Node.js 20.18.1 and the validated Rust minimum is
1.88. Node packages are assembled and tested as CI candidate artifacts; the
release pipeline publishes only standalone GitHub Release assets. Registry
distribution requires a new decision and implementation. Version selection and
release tags require separate authorization.

Cargo workspace package metadata is the product-version authority. The npm
root, native packages, standalone archive names, generated installers, and CLI
identity are derived from it and checked with `bun run release:check`.
Standalone installation is available from immutable, checksummed GitHub Releases
in `cpaikr/kasb` and carries an adjacent ownership receipt. See
[release posture](docs/release.md) for current status.

## License

Elastic License 2.0. See [LICENSE.md](LICENSE.md).
