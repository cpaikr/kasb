# @sjunepark/kasb

Read-only KASB standards and Q&A access for Node.js and TypeScript hosts.

The package provides:

- the `kasb` JSON CLI;
- `@sjunepark/kasb/toolset` for in-process operation discovery, schemas,
  validation, execution, error serialization, and `AbortSignal` cancellation;
- `@sjunepark/kasb/pi` and the registered Pi extension adapter.

```ts
import { createKasbToolset } from "@sjunepark/kasb/toolset";

const kasb = createKasbToolset();
const help = kasb.getCommandHelp("search-standards");
const validation = kasb.validateInput("search-standards", { keyword: "리스" });
```

The CLI emits one JSON envelope on success and one JSON failure envelope on
failure. Treat `kasb --help` and `kasb help <command>` as the command reference.

From this package root:

```sh
bun run typecheck
bun test
bun run build
```

Node.js 20.18.1 or newer is required for npm/npx usage. Source development and
tests use Bun.

## License

Elastic License 2.0. See [LICENSE.md](./LICENSE.md).
