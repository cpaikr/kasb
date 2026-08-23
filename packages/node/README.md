# @sjunepark/kasb

Read-only KASB standards and Q&A access for Node.js and TypeScript hosts,
backed by the public Rust SDK.

The package provides:

- six asynchronous SDK operations through Node-API;
- `@sjunepark/kasb/toolset` for network-free discovery, schemas, validation,
  execution, error serialization, structured recovery metadata, and
  `AbortSignal` cancellation; and
- the `kasb` executable as a transparent launcher for the packaged Rust CLI.

```ts
import { searchStandards } from "@sjunepark/kasb";
import { createKasbToolset } from "@sjunepark/kasb/toolset";

const result = await searchStandards({ keyword: "리스" });

const toolset = createKasbToolset();
const help = toolset.getCommandHelp("search-standards");
const validation = toolset.validateInput("search-standards", {
  keyword: "리스",
});
```

The SDK delegates every KASB request, decode, normalization rule, and domain
failure to Rust. JavaScript owns only public ergonomics, network-free input
validation, native target selection, and transparent process launch. The
launcher does not download, compile, parse commands, render output, or provide
a JavaScript fallback.

Treat `kasb --help` and `kasb help <command>` as the CLI reference. Machine
invocations emit one newline-terminated JSON document on stdout. The launcher
forwards the native binary's arguments, environment, working directory,
streams, termination, and exit behavior without a shell.

Supported native targets are Linux GNU x64/ARM64, macOS ARM64, and Windows x64.
Linux GNU requires glibc 2.28 or newer. POSIX targets preserve signal identity;
Windows preserves termination without claiming POSIX signal identity.
Continuous CI intentionally covers Linux GNU x64/ARM64 only. macOS ARM64 and
Windows x64 retain their supported packages but are not continuously tested.

Contained native panics reach callers only as `internal_failure`. Operators may
subscribe to `sjunepark.kasb.native`; its only panic event is
`{ code: "binding_panic" }`. Panic details and unsolicited stderr are never
emitted.

Node.js 20.18.1 or newer is required. Source development and tests use Bun.

## License

Elastic License 2.0. See [LICENSE.md](./LICENSE.md).
