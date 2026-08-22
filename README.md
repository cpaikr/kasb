# kasb

Read-only access to KASB standards and Q&A material through a public Rust SDK,
Rust-backed Node SDK, and Rust CLI.

The repository is preparing a `../ytm`-shaped rewrite: `crates/kasb` will become
the sole KASB HTTP and domain implementation. A Node SDK will call it through a
narrow asynchronous Node-API binding, and a separate `clap` CLI will call the
same Rust SDK directly. The npm package retains `kasb` as a transparent launcher
for the packaged Rust binary and retains `@sjunepark/kasb/toolset`. The Pi
adapter will be removed at cutover.

## Current checkout

- [`packages/kasb-ts`](packages/kasb-ts/README.md) currently contains the npm
  package, complete six-operation TypeScript implementation, CLI, toolset, and
  Pi adapter.
- [`crates/kasb`](crates/kasb/README.md) is an independently buildable public
  Rust SDK with the validated `get-paragraph` vertical pilot.
- `fixtures/` and `conformance/` contain shared source evidence and serialized
  compatibility cases.

The current implementations remain intact until the replacement passes the
approved cutover gates. See [ARCHITECTURE.md](ARCHITECTURE.md) for current and
target boundaries, [VISION.md](VISION.md) for product scope, and
[plans/rust-node-rewrite.md](plans/rust-node-rewrite.md) for the scheduled work.

## Development commands

```sh
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run build
cargo fmt --all --check
cargo clippy --locked --workspace --all-targets -- -D warnings
```

Use `bun packages/kasb-ts/src/cli.ts --help` for the current source CLI and
`node packages/kasb-ts/dist/cli.js --help` after building. Live KASB checks are
opt-in through `bun run test:live` because upstream behavior can drift.

The current npm runtime floor is Node.js 20.18.1 and the validated Rust minimum
is 1.88. The rewrite preserves the Node floor unless native-binding evidence
requires an explicitly reviewed change.

## License

Elastic License 2.0. See [LICENSE.md](LICENSE.md).
