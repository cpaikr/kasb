# kasb

A read-only dual-SDK project for searching and retrieving KASB standards and Q&A material.

The existing npm SDK, CLI, and Pi adapter remain supported while a native Rust
SDK is developed through the approved migration. The Rust SDK will implement
the same v1 semantics and share fixtures and serialized conformance cases with
TypeScript; neither SDK will depend on the other language at runtime. See
[MIGRATION.md](MIGRATION.md) for the migration gates and current status.

## Public surfaces

The public product surfaces are:

- `kasb`: for humans, subprocess-based agents, and desktop hosts that need a process boundary. CLI commands and options are not duplicated here; treat `kasb --help` and `kasb help <command>` as the usage reference.
- `@sjunepark/kasb/toolset`: for trusted JS/TS server hosts that run KASB in-process and need operation discovery, schemas, validation, execution, error serialization, and `AbortSignal` cancellation support without adopting any host-specific tool protocol.
- native Rust SDK: under active migration; it will expose the same domain
  operations and serialized contract through a Rust-native API using `wreq`.

```ts
import { createKasbToolset } from "@sjunepark/kasb/toolset";

const kasb = createKasbToolset();
const help = kasb.getCommandHelp("search-standards");
const validation = kasb.validateInput("search-standards", { keyword: "리스" });
```

Command success emits one JSON envelope to stdout. Command failure emits one JSON failure envelope to stdout with a nonzero exit code. Help output remains human-readable.

Toolset validation failures include structured recovery metadata for host adapters: `recoverable`, `recoveryAction`, `operationName`, `parameter`, and a human-readable `recoveryHint` when useful. `recoverable` means the caller can repair the input; `retryable` is reserved for cases where the same request might succeed later.

`@sjunepark/kasb/pi` and the package `pi.extensions` entry are retained as a product-specific Pi adapter for Pi hosts that need one single action-oriented tool over the neutral toolset. They are not the basis for the SDK contract; trusted server hosts should import `@sjunepark/kasb/toolset` directly.

The Node.js `kasb` command remains the sole CLI. A separate Rust CLI is not part
of the approved migration.

## Development commands

Until the phase-3 workspace move lands, the TypeScript package remains at the
repository root:

```sh
bun install
bun run typecheck
bun test
bun run build
```

Shared compatibility inputs live under `fixtures/` and `conformance/`. The
workspace phase will move the npm package to `packages/kasb-ts/`, add
`crates/kasb/`, and document package-local commands once they exist.

npm/npx usage requires Node.js 20.18.1 or newer; TypeScript source development
and tests use Bun. The Rust toolchain requirement will be recorded with the
workspace. Both implementations read observed public KASB web/API behavior in
read-only mode, so upstream KASB changes can affect results.

## License

Elastic License 2.0. See [LICENSE.md](./LICENSE.md).
