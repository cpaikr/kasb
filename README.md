# kasb

A read-only TypeScript/Rust workspace for searching and retrieving KASB
standards and Q&A material.

- [`packages/kasb-ts`](packages/kasb-ts/README.md) contains the published npm
  SDK, the sole `kasb` CLI, and the Pi adapter.
- [`crates/kasb`](crates/kasb) contains the independently buildable Rust crate
  scaffold for the phase-4 native SDK pilot.
- `fixtures/` and `conformance/` are shared evidence; TypeScript consumes them
  now and the Rust pilot will consume them independently in phase 4.

The implementations share the v1 serialized contract, not runtime code or FFI. See
[MIGRATION.md](MIGRATION.md) for the active gates and
[ARCHITECTURE.md](ARCHITECTURE.md) for layer ownership.

## Development commands

```sh
bun install
bun run typecheck
bun run test
bun run build
```

Package-local gates are independently runnable:

```sh
cd packages/kasb-ts
bun run typecheck
bun test
bun run build

cd ../../crates/kasb
cargo build --locked
cargo test --locked
```

Use `bun packages/kasb-ts/src/cli.ts --help` for the source CLI and
`node packages/kasb-ts/dist/cli.js --help` after building.

npm/npx usage requires Node.js 20.18.1 or newer; TypeScript source development
and tests use Bun. Rust 1.85 or newer is required. Both implementations read
observed public KASB web/API behavior in read-only mode, so upstream KASB
changes can affect results.

## License

Elastic License 2.0. See [LICENSE.md](./LICENSE.md).
