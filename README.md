# kasb

Read-only access to KASB standards and Q&A material through a public Rust SDK,
Rust-backed Node SDK, and Rust CLI.

The repository is executing a `../ytm`-shaped Rust/Node rewrite. See
[MIGRATION.md](MIGRATION.md) for authoritative transition status and
[ARCHITECTURE.md](ARCHITECTURE.md) for the target boundaries.

## Current checkout

- [`packages/kasb-ts`](packages/kasb-ts/README.md) currently contains the npm
  package, complete six-operation TypeScript implementation, CLI, toolset, and
  Pi adapter.
- [`crates/kasb`](crates/kasb/README.md) is an independently buildable public
  Rust SDK implementing all six v1 operations. The TypeScript implementation
  remains present as the executable cutover reference until later gates pass.
- `fixtures/` and `conformance/` contain shared source evidence and serialized
  compatibility cases. The process-isolated judge verifies the TypeScript,
  public Rust SDK, Rust CLI, and Rust-backed Node candidate surfaces and rejects
  deliberate behavioral corruption.
- `contracts/kasb/openapi.yaml` owns the supported provider wire facts; its
  source-adapter profile records only cross-response and decoding rules that
  OpenAPI cannot express. `crates/kasb-node`, `packages/node`, and
  `packages/native` now contain the private Phase 4 cutover candidate under
  validation; they are not yet the canonical or supported npm product.

The current implementations remain intact until the replacement passes the
approved cutover gates. See [MIGRATION.md](MIGRATION.md) for current status,
[VISION.md](VISION.md) for product scope, and
[plans/rust-node-rewrite.md](plans/rust-node-rewrite.md) for the scheduled work.

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

`bun run native:feasibility` probes the current host. The target matrix stays
unclaimed until every native build, immutable packed-consumer, direct CLI
archive, and review gate passes in CI.

The candidate Linux GNU packages target glibc 2.28 or newer. The npm launcher
preserves POSIX signal identity where the platform supports it; Windows uses
Node's forceful termination semantics and does not claim exact POSIX signal
identity.

Use `bun packages/kasb-ts/src/cli.ts --help` for the current npm/source CLI and
`node packages/kasb-ts/dist/cli.js --help` after building. The replacement Rust
CLI is available for direct validation with
`cargo run --locked -p kasb-cli --bin kasb -- --help`; npm does not launch it
until the later native-package cutover gate passes. Live KASB checks are opt-in
through `bun run test:live` because upstream behavior can drift.

The current npm runtime floor is Node.js 20.18.1 and the validated Rust minimum
is 1.88. The rewrite preserves the Node floor unless native-binding evidence
requires an explicitly reviewed change.

## License

Elastic License 2.0. See [LICENSE.md](LICENSE.md).
