# KASB Rust-backed Node candidate

This private cutover candidate contains the six-operation Node SDK, the
network-free KASB toolset, and the transparent npm launcher for the packaged
Rust `kasb` CLI. The SDK delegates KASB execution to the asynchronous Node-API
binding; the launcher only selects the exact-version platform package and
forwards the child process contract without a shell.

The candidate intentionally uses a temporary package identity while the
existing TypeScript product remains installed for comparison. It must not be
published. Every native target and clean packed-consumer gate has passed; the
canonical `@sjunepark/kasb` identity is still promoted only during the final
cutover.

Supported-target claims are generated from `native-targets.json`. Linux GNU
x64/ARM64, macOS ARM64, and Windows x64 passed native CI builds, the
exact-artifact consumer matrix across the listed Node versions, direct CLI
archives, and aggregate artifact validation. The Node engine floor remains
`20.18.1`; the manifest separately records the listed versions with explicit
native-consumer evidence.

Contained native panics surface to SDK callers only as the sanitized
`internal_failure`. Operators may subscribe to the Node diagnostics channel
`sjunepark.kasb.native`; the only panic event is the frozen payload
`{ code: "binding_panic" }`. As required by Node's diagnostics-channel
contract, subscribers must not throw. Panic details are never emitted through
the event or unsolicited stderr.

Linux GNU x64 and ARM64 require glibc 2.28 or newer. The native gate builds and
tests both the addon and same-revision CLI on that floor and rejects newer glibc
symbol requirements. The launcher preserves POSIX signal identity where
supported. Windows preserves the rest of the process contract and performs
best-effort forceful child termination for console signals, but exact POSIX
signal identity is not part of the Windows contract.
