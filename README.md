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
without claiming POSIX signal identity.

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
1.88. Registry publication, version selection, and release tags require
separate authorization.

## License

Elastic License 2.0. See [LICENSE.md](LICENSE.md).
