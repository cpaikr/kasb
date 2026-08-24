# Transport Decision

## Decision

The supported public projections are:

- the native `kasb` Rust SDK;
- the native Rust `kasb` CLI; and
- the Node SDK, including `@sjunepark/kasb/toolset`.

Rust is the sole KASB conformer. The CLI invokes the public SDK directly. The
Node surfaces invoke it through a narrow asynchronous Node-API binding and do
not own URLs, request serialization, transport, source decoding, normalization,
or capability failures.

The Rust CLI owns flags, help, stdout/stderr, presentation, and exit status. The
Node SDK/toolset owns side-effect-free discovery and validation plus JavaScript
ergonomics. Both use the same stable operation identities.

The npm package retains a `kasb` executable for installation convenience. Its
JavaScript entrypoint is only a shell-free target resolver and process launcher
for the exact Rust CLI binary in the selected optional platform package. It
forwards the process contract and owns no KASB command behavior.

## Process contract

- Machine-mode success and failure are one newline-terminated JSON document on
  `stdout`; failure exits nonzero.
- Human-readable help remains separate from machine execution output.
- Discovery, command help, and validation do not contact KASB.
- Cancellation crosses Node-API explicitly and remains distinct from timeout or
  provider failure.
- The CLI transport and Node SDK call the public Rust capability boundary; npm
  launcher and JavaScript facade code never call KASB endpoints directly.
- The npm launcher does not download, compile, parse, render, or fall back to a
  JavaScript implementation.

## Out of scope

- Pi, MCP, or another host-specific adapter;
- a second CLI implementation in JavaScript;
- browser, edge, Deno, or Bun-runtime npm support;
- database persistence, background ingestion, or HTTP wrappers; and
- a JavaScript transport-injection seam that would create a second conformer.
