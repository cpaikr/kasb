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
  compatibility cases. The process-isolated judge verifies both complete
  TypeScript and Rust operation surfaces and rejects deliberate behavioral
  corruption.
- `contracts/kasb/openapi.yaml` owns the supported provider wire facts; its
  source-adapter profile records only cross-response and decoding rules that
  OpenAPI cannot express. The Node-API and native-launcher code in
  this phase remains a private feasibility proof, not the cutover product.

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

`bun run native:feasibility` probes the current host. Phase 1 evidence covers
macOS ARM64 only; the remaining planned targets stay unclaimed until their
native build and packed-consumer gates pass.

Use `bun packages/kasb-ts/src/cli.ts --help` for the current source CLI and
`node packages/kasb-ts/dist/cli.js --help` after building. Live KASB checks are
opt-in through `bun run test:live` because upstream behavior can drift.

The current npm runtime floor is Node.js 20.18.1 and the validated Rust minimum
is 1.88. The rewrite preserves the Node floor unless native-binding evidence
requires an explicitly reviewed change.

## License

Elastic License 2.0. See [LICENSE.md](LICENSE.md).
