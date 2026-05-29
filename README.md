# kasb

A read-only tool package for searching and retrieving KASB standards and Q&A material.

## Public surfaces

The reusable package contract is the `kasb` CLI plus the neutral TypeScript toolset SDK:

- `kasb`: for humans, subprocess-based agents, and desktop hosts that need a process boundary. CLI commands and options are not duplicated here; treat `kasb --help` and `kasb help <command>` as the usage reference.
- `@sjunepark/kasb/toolset`: for trusted JS/TS server hosts that run KASB in-process and need operation discovery, schemas, validation, execution, error serialization, and `AbortSignal` cancellation support without adopting any host-specific tool protocol.

```ts
import { createKasbToolset } from "@sjunepark/kasb/toolset";

const kasb = createKasbToolset();
const help = kasb.getCommandHelp("search-standards");
const validation = kasb.validateInput("search-standards", { keyword: "리스" });
```

Command success emits one JSON envelope to stdout. Command failure emits one JSON failure envelope to stdout with a nonzero exit code. Help output remains human-readable.

Toolset validation failures include structured recovery metadata for host adapters: `recoverable`, `recoveryAction`, `operationName`, `parameter`, and a human-readable `recoveryHint` when useful. `recoverable` means the caller can repair the input; `retryable` is reserved for cases where the same request might succeed later.

`@sjunepark/kasb/pi` and the package `pi.extensions` entry are retained as a product-specific Pi adapter for Pi hosts that need one single action-oriented tool over the neutral toolset. They are not the basis for the SDK contract; trusted server hosts should import `@sjunepark/kasb/toolset` directly.

npm/npx usage requires Node.js 20.18.1 or newer; source development and tests use Bun. This package reads observed public KASB web/API behavior in read-only mode, so upstream KASB changes can affect results.

## License

Elastic License 2.0. See [LICENSE.md](./LICENSE.md).
