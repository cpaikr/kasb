# Architecture

## Purpose and boundary

KASB is a read-only standards product with three supported public projections:
an idiomatic Rust SDK, a Rust CLI, and a Rust-backed Node SDK. One public Rust
SDK owns KASB HTTP and domain behavior. The CLI is a separate `clap` binary over
that SDK, and Node reaches it through a narrow asynchronous Node-API binding.

The npm package also exposes `kasb`, but its JavaScript entrypoint only selects
and launches the packaged Rust CLI binary. Pi, MCP, browser automation,
database ingestion, and mutation are outside the architecture.

## System shape

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

fixtures/ + conformance/ provide independent evidence across public paths
```

Dependencies point downward only. The public Rust SDK contains no Node types,
and JavaScript owns no KASB wire, source-decoding, normalization, or CLI
behavior.

## Components and start-here paths

- `docs/specs/kasb-standards-v1.md` owns public operation semantics,
  identifiers, envelopes, warnings, and stable failures.
- `docs/research/kasb-standard-source-map.md` contains dated observations about
  KASB public read surfaces. It is evidence, not contract authority.
- `contracts/kasb/openapi.yaml` is the sole authority for supported HTTP paths,
  parameters, statuses, media types, and wire schemas. The adjacent
  language-neutral source profile records cross-response and decoding rules
  that OpenAPI cannot express.
- `crates/kasb` is the public Rust SDK and sole conformer. Start at
  `src/lib.rs`, then follow the capability, source, and HTTP modules.
- `crates/kasb-cli` owns command parsing, help, presentation, stdout/stderr,
  cancellation, and exit behavior over the public SDK.
- `crates/kasb-node` projects all six SDK operations asynchronously. It owns
  cancellation, stable failure serialization, reusable client lifetime, and
  panic containment, but no source rules.
- `packages/node` is the canonical Node SDK, network-free toolset, native
  loader, and transparent npm CLI launcher.
- `packages/native` contains generated platform-package metadata for the Node
  addon and same-revision Rust CLI.
- `fixtures` and `conformance` provide captured provider evidence, committed
  outcomes, process-isolated public-surface runners, and known-bad controls.
- `native-targets.json` owns target selection, package and standalone archive
  identities, compatibility floors, release bounds, the receipt schema, and
  support claims. Cargo workspace metadata owns the product version.
- `plans/rust-node-rewrite.md` records completed cutover gates and evidence; it
  does not define runtime architecture or public semantics.

## Runtime flows

The Rust SDK path is direct:

```text
Rust caller -> KasbClient -> capability -> KASB source adapter
            -> bounded wreq persona transport -> db.kasb.or.kr/api
```

The CLI adds only command transport:

```text
kasb -> clap command -> KasbClient -> capability -> source adapter -> KASB
```

The Node SDK adds only projection:

```text
Node caller -> Node facade -> async Node-API binding -> KasbClient
            -> capability -> source adapter -> KASB
```

The npm command path does not call Node-API:

```text
npm bin shim -> JavaScript target resolver -> packaged Rust kasb binary
```

The only approved runtime artifact download is an explicit, receipt-managed
standalone upgrade:

```text
kasb upgrade -> immutable cpaikr/kasb release -> checksum + binary identity
             -> same-filesystem stage -> executable + receipt replacement
```

`upgrade --check` performs bounded release discovery without replacement.
Source-built, npm-owned, missing-receipt, or digest-mismatched executables are
unmanaged and must be upgraded by their owner. Ordinary KASB commands never
perform update discovery.

The Node facade may reject malformed public input without network access. Rust
validates again at the native trust boundary. `KasbClient` owns transport
lifetime, clock/cancellation composition, and capability execution. The binding
serializes project-owned values and contains panics. A contained panic becomes
the stable public `internal_failure`; subscribed operators receive only
`{ code: "binding_panic" }` on `sjunepark.kasb.native`. Panic details and
unsolicited diagnostics never cross the boundary.

The Rust CLI alone owns flags, help, stdout/stderr, formatting, and exit status.
The npm launcher forwards arguments, environment, working directory, standard
streams, termination, and exit status without parsing KASB commands.

## Authority and ownership

| Concern | Owner |
| --- | --- |
| Supported KASB HTTP wire facts | `contracts/kasb/openapi.yaml` |
| Public v1 operation semantics | `docs/specs/kasb-standards-v1.md` |
| Observed provider behavior | `docs/research/kasb-standard-source-map.md` |
| Native requests, results, validation, and failures | `crates/kasb` |
| HTTP policy, persona, source decoding, normalization | `crates/kasb` |
| CLI commands, rendering, and process contract | `crates/kasb-cli` |
| Node cancellation and safe native projection | `crates/kasb-node` |
| Node SDK, tool discovery, and JavaScript ergonomics | `packages/node` |
| npm target selection and transparent launch | `packages/node` |
| Native support matrix and package constraints | `native-targets.json` |
| Product version | `[workspace.package].version` in `Cargo.toml` |
| Standalone release, installer, and receipt policy | `native-targets.json` |
| Deterministic behavior evidence | `fixtures`, `conformance` |

OpenAPI is handwritten and validated; it does not generate the Rust conformer.
Fixtures and outcomes are independent evidence, not a parallel wire authority.
Generated declarations, loaders, manifests, and facade files identify one
canonical input and have freshness checks.

## Invariants

- `crates/kasb` remains usable without Node.js and contains no Node-API types.
- `crates/kasb-cli` depends on the public SDK and contains no second conformer.
- Rust alone knows KASB origins, paths, headers, transport policy, source
  response shapes, and normalization rules.
- Public boundaries use project-owned requests, results, warnings, failures,
  and cancellation values; dependency types remain private.
- Node-API operations are asynchronous, cancellation-aware, and panic-safe.
- Node SDK and toolset discovery and input validation are network-free.
- Public JSON uses camelCase fields; CLI flags use kebab-case.
- Machine CLI invocations emit one newline-terminated JSON document on stdout;
  help and diagnostics do not contaminate structured output.
- The npm launcher has no command parser or presentation behavior. It selects
  an exact-version target package and launches without a shell.
- Provider bytes, retries, concurrency, deadlines, redirects, cookies, proxies,
  and persona rotation are explicit and bounded.
- Rust and Node agree at the serialized semantic boundary except for explicitly
  permitted runtime metadata.
- A conformance claim requires deliberate corrupted outcomes to be rejected.
- A native target is supported only after native build, package assembly,
  direct-CLI, and clean-consumer validation on that target.
- Pi code and metadata are absent; no replacement adapter is part of v1.

## Native distribution boundary

The root npm package contains JavaScript and declarations and selects an
exact-version optional native package. Each target package declares its OS,
architecture, and Linux libc constraints and contains both the Node addon and
Rust CLI binary built from the same revision. The launcher never downloads or
compiles artifacts during install or first use.

Standalone CLI archives reuse those target binaries but have separate
ownership. Generated shell and PowerShell installers accept only the canonical
repository/tag identity, an immutable release, bounded HTTPS responses, and an
exact SHA-256 entry. They publish the binary and adjacent receipt recoverably.
On Windows, a detached helper performs replacement after the running process
exits and records a terminal status; scheduling is not reported as applied.

The supported matrix is Linux GNU x64/ARM64, macOS ARM64, and Windows x64. Each
target passed native build, same-revision artifact, direct CLI, and clean packed
consumer validation. Unsupported or incomplete installations fail with a
stable actionable error rather than raw loader or spawn details.

Continuous CI is deliberately narrower than the supported matrix. It builds
and tests Linux GNU x64/ARM64 on GitHub-hosted runners; macOS ARM64 and Windows x64 are
omitted to reduce compute cost. Their packages and support claims remain based
on the recorded cutover validation, but they do not receive ongoing CI evidence.
`native-targets.json` records this distinction explicitly.

Linux GNU x64 and ARM64 require glibc 2.28. Both artifacts are built in pinned
manylinux 2.28 containers, rejected if symbols require newer glibc, and tested
by clean consumers at the floor. Windows preserves arguments, environment,
working directory, stdio, normal exits, and termination, but does not claim
POSIX signal identity because Node exposes forceful process termination there.

The Rust crate and CLI remain independently distributable. Direct CLI archives
and npm platform packages reuse the same release-built binary. A Rust
source-build target does not automatically become an npm support claim.

## Cutover record

The replacement Rust SDK, Rust CLI, Node binding, Node SDK, npm launcher,
claimed native packages, adversarial judge, live checks, and clean-consumer
gates passed before the TypeScript implementation and Pi surface were removed.
Final cutover CI, review, and PR delivery gates passed, and PR #20 promoted the
completed rewrite to `main`.
[MIGRATION.md](MIGRATION.md) records the decision. Git history is the recovery
path; registry publication remains a separate, unauthorized action.
