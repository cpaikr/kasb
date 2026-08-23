# Architecture

## Purpose and boundary

KASB is a read-only standards product with three supported public projections:
an idiomatic Rust SDK, a Node SDK, and a Rust CLI. The approved target has one
Rust implementation of KASB HTTP and domain behavior. The Node SDK calls that
implementation through a narrow asynchronous Node-API binding. The CLI is a
separate `clap` binary over the same public Rust SDK.

The current checkout is transitional: the complete Rust SDK and Rust CLI are
integrated, and the Rust-backed Node product and four-target native package
matrix have passed their replacement gates before cutover.
[MIGRATION.md](MIGRATION.md) owns the authoritative implementation status; this
document owns current and target component boundaries.

The npm package also exposes `kasb`, but its JavaScript entrypoint only selects
and launches the packaged Rust CLI binary. Pi, MCP, browser automation,
database ingestion, and mutation are outside the target architecture.

## Target system shape

```text
contracts/kasb/openapi.yaml       docs/specs/kasb-standards-v1.md
        wire authority                    semantic authority
                 \                         /
                  v                       v
                         crates/kasb
                  public Rust SDK + sole conformer
                         /             \
                        v               v
                crates/kasb-cli    crates/kasb-node
                 Rust clap CLI      async Node-API
                        |               |
                        |               v
                        |          packages/node
                        |       Node SDK + CLI launcher
                         \             /
                          v           v
                    packages/native/*
                  CLI binary + Node addon

fixtures/ + conformance/judge provide independent evidence across public paths
```

Dependencies point downward only. Rust never imports Node types in the public
SDK, and JavaScript never owns KASB wire or source behavior.

## Components and start-here paths

- `docs/specs/kasb-standards-v1.md` — public operation semantics, identifiers,
  envelopes, warnings, and stable failures.
- `docs/research/kasb-standard-source-map.md` — dated observations about KASB
  public read surfaces; evidence rather than contract authority.
- `contracts/kasb/openapi.yaml` — validated sole authority for supported HTTP
  paths, parameters, statuses, media types, and wire schemas, complemented by
  the language-neutral source-adapter profile in the same directory.
- `crates/kasb` — public Rust SDK and target sole conformer. Start at
  `src/lib.rs`, then follow capability, source, and HTTP modules; consult
  [MIGRATION.md](MIGRATION.md) for transition status.
- `crates/kasb-cli` — implemented first-class Rust `clap` CLI over
  `crates/kasb`. It owns command parsing, presentation, stdout/stderr, and exit
  status, while npm stays on the transition CLI until the canonical cutover.
- `crates/kasb-node` — implemented Phase 4 candidate for the asynchronous
  projection of all six public Rust SDK operations. It owns cancellation,
  stable failure serialization, reusable client lifetime, and panic
  containment, not source rules; the four-target native gates have passed.
- `packages/node` — private cutover candidate for the Node SDK, network-free
  toolset, native loader, and transparent npm CLI launcher. It replaces
  `packages/kasb-ts` only at cutover.
- `packages/native` — generated platform-package metadata for the Node addon
  and same-revision Rust CLI. Linux GNU x64/ARM64, macOS ARM64, and Windows x64
  are supported by native CI and packed-consumer evidence at the candidate
  revision.
- `fixtures` — captured provider responses used as independent deterministic
  evidence.
- `conformance` and its process-isolated judge — public behavior cases,
  expected outcomes, and deliberate known-bad controls.
- `plans/rust-node-rewrite.md` — execution gates and cutover conditions; it does
  not define runtime architecture or public semantics.

## Runtime flow

The public Rust path is direct:

```text
Rust caller -> KasbClient -> capability -> KASB source adapter
            -> bounded wreq persona transport -> db.kasb.or.kr/api
```

The Rust CLI path adds transport only:

```text
kasb -> clap command -> KasbClient -> capability -> KASB source adapter
     -> wreq transport
```

The Node SDK path adds projection only:

```text
Node caller -> Node facade -> async Node-API binding -> KasbClient
            -> capability -> KASB source adapter -> wreq transport
```

The npm command path does not call Node-API:

```text
npm bin shim -> JavaScript target resolver -> packaged Rust kasb binary
```

The Node facade may reject malformed public input without network access. Rust
validates again at the native trust boundary. `KasbClient` owns reusable
transport lifetime, clock/cancellation composition, and capability execution.
The binding serializes project-owned values and contains panics. A contained
panic remains a sanitized `internal_failure`; the Node facade additionally
publishes only `{ code: "binding_panic" }` on the
`sjunepark.kasb.native` diagnostics channel when subscribed. It never exposes
panic details or writes unsolicited diagnostics. The Rust CLI
alone owns flags, stdout/stderr, formatting, help, and exit status. The npm
launcher forwards arguments, environment, current directory, standard streams,
signals, and exit status without parsing KASB commands.

## Authority and ownership

| Concern | Owner |
| --- | --- |
| Supported KASB HTTP wire facts | `contracts/kasb/openapi.yaml` |
| Public v1 operation semantics | `docs/specs/kasb-standards-v1.md` |
| Observed provider behavior | `docs/research/kasb-standard-source-map.md` |
| Native requests, results, validation, and failures | `crates/kasb` |
| HTTP policy, persona, source decoding, normalization | `crates/kasb` |
| CLI commands, flags, help, rendering, and process contract | `crates/kasb-cli` |
| Node cancellation and safe native projection | `crates/kasb-node` |
| Node SDK/tool discovery and JavaScript ergonomics | `packages/node` |
| npm target selection and transparent process launch | `packages/node` |
| Native support matrix, package constraints, and platform selection | `native-targets.json` |
| Deterministic provider and behavior evidence | `fixtures`, `conformance`, and judge expectations |

OpenAPI is handwritten and validated; it does not generate the Rust conformer.
Fixtures and golden outcomes are evidence and cannot silently become a parallel
wire authority. Generated declarations, loaders, native manifests, and built
facade files identify one canonical input and have freshness checks.

## Invariants

- `crates/kasb` remains usable without Node.js and contains no Node-API types.
- `crates/kasb-cli` depends on the public Rust SDK rather than a private second
  implementation of KASB behavior.
- Rust is the only post-cutover component allowed to know KASB origins, paths,
  headers, request serialization, transport policy, source response shapes, or
  normalization rules.
- Public and cross-boundary APIs use project-owned request, result, warning,
  failure, and cancellation values; dependency types stay private.
- The Node-API surface is asynchronous, preserves caller cancellation, reuses
  the intended client lifetime, and contains panics as stable internal defects.
- Node SDK/toolset discovery and input preparation remain side-effect-free and
  require no network execution where practical.
- Public JSON request fields use camelCase; CLI flags use kebab-case.
- Rust CLI machine invocations emit one newline-terminated JSON document on stdout;
  logs and help diagnostics never contaminate structured output.
- The npm `kasb` launcher contains no command parser or presentation behavior;
  it launches the exact-version target binary without a shell and preserves the
  child process contract.
- Provider response bytes, retries, concurrency, deadlines, redirects, cookies,
  proxies, and persona rotation are explicit and bounded.
- Source drift maps to stable project-owned failures rather than dependency
  messages or arbitrary fallback.
- The public Rust and Node projections agree at the serialized semantic
  boundary; only explicitly permitted runtime metadata may differ.
- A judge claim is valid only when deliberate corrupted outcomes are rejected.
- An npm native target is supported only after native build, package assembly,
  and clean-consumer tests pass on that target.
- Pi code and metadata are removed at cutover and no replacement adapter is
  added under this rewrite.

## Native distribution boundary

The npm package keeps JavaScript and declarations in its root package and
selects an exact-version optional native package for the current platform. Each
target package declares its operating-system, architecture, and Linux libc
constraints and contains both the Node-API addon and the Rust CLI binary built
from the same revision. The JavaScript `bin` entrypoint resolves that package
and launches its binary; it does not download or compile artifacts during
install or first use.

The supported matrix is Linux GNU x64/ARM64, macOS ARM64, and Windows x64.
Each target passed native build, same-revision artifact, direct CLI, and clean
packed-consumer validation before this support claim was promoted. Unsupported
or incompletely installed targets fail with a stable, actionable installation
error rather than a raw loader or spawn exception.

Linux GNU x64 and ARM64 use glibc 2.28 as the minimum runtime. The addon and
same-revision CLI are built in digest-pinned manylinux 2.28 containers, rejected
when imported symbols require a newer glibc, and exercised by clean consumers
on the floor runtime. On Windows, the launcher preserves arguments,
environment, working directory, stdio, normal exits, and termination, but does
not claim exact POSIX signal identity because Node exposes forceful process
termination rather than POSIX signals there.

The public Rust crate and CLI are also distributable independently from npm.
Direct CLI archives and npm target packages reuse the same release-built binary
instead of rebuilding or fetching it through the launcher. A Rust source-build
target does not automatically become an npm support claim, and a Node-API
binary does not narrow the crate's public API.

## Transition and removal

The current transition stage is recorded in [MIGRATION.md](MIGRATION.md). Until
cutover, the judge compares public semantics without treating TypeScript
internals as authority.

Cutover occurs only after the complete Rust SDK, Rust CLI, Node binding, thin
Node SDK, transparent npm launcher, claimed native packages, public-surface
judge, live checks, clean consumers, and review gates pass. The cutover then
removes TypeScript transport, source, normalization, capability execution, and
CLI implementation together with the Pi surface. Ordinary Git history remains
the recovery path; publication is a separate decision.
