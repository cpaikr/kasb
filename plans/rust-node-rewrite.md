# Rewrite KASB around a public Rust SDK, Node SDK, and Rust CLI

## Outcome

KASB becomes a read-only product with one public Rust SDK owning all KASB HTTP,
normalization, and domain behavior. A separate Rust `clap` CLI uses that SDK
directly. The Node SDK and neutral toolset use it through a narrow asynchronous
Node-API binding. The npm `kasb` entrypoint remains available only as a
transparent launcher for the packaged Rust CLI binary. The TypeScript HTTP,
capability, and CLI implementation and Pi adapter are removed only after the
replacement passes independent contract, black-box, package-consumer,
native-target, and live verification.

## Current state

- `main` contains the validated TypeScript implementation of all six v1
  operations and the completed Rust `get-paragraph` vertical pilot.
- `crates/kasb` already supplies public Rust request/result types, typed
  failures, validation, `wreq` persona transport, cancellation, fixture tests,
  and shared conformance for the pilot.
- `packages/kasb-ts` currently owns the npm package, CLI, neutral toolset, Pi
  adapter, all six source adapters, and the TypeScript conformance runner.
- `fixtures/` and `conformance/` provide reusable source evidence and serialized
  expectations, including deliberate known-bad controls.
- The completed pilot goal is recorded in
  `goals/rust-migration-foundation-pilot.md`; it does not authorize this rewrite.
- The former additive dual-SDK direction is superseded. The target is one Rust
  conformer with three supported public projections: the Rust SDK, Rust CLI,
  and Rust-backed Node SDK.
- Delivery phases 1 through 3 are integrated. The frozen compatibility
  inventory, OpenAPI authority and freshness checks, adversarial process judge,
  all six public Rust SDK operations, and the first-class Rust CLI are complete.
- Delivery phase 4 has an implemented Rust-backed Node and native-package
  candidate under validation. No cutover or native support beyond the proven
  macOS ARM64 host check is claimed yet. The TypeScript npm executable remains
  unchanged until the Node, packaging, review, and cutover gates pass.

## Decisions

- Keep `crates/kasb` as a supported public Rust SDK and the sole implementation
  of KASB wire, transport, source decoding, normalization, domain policy, and
  stable capability failures.
- Add a narrow asynchronous Node-API binding, normally with napi-rs. The binding
  projects project-owned inputs, outputs, cancellation, and sanitized failures;
  it must not expose `wreq`, source payload, parser, or panic details.
- Add a separate Rust CLI crate using `clap` and the public Rust SDK. It alone
  owns commands, flags, help, formatting, stdout/stderr, and exit behavior.
- Preserve the npm package identity, `kasb` executable, Node SDK/toolset exports,
  operation names, camelCase JSON inputs, machine-readable success/failure
  behavior, and current Node runtime floor unless evidence requires a reviewed
  breaking change. The npm executable is a launcher, not a JavaScript CLI.
- Remove the `./pi` export, Pi extension entrypoint, registration metadata, and
  Pi-specific tests and documentation at cutover. Do not replace them with MCP
  or another host adapter in this rewrite.
- Make `contracts/kasb/openapi.yaml` the sole repository authority for the
  supported KASB HTTP wire surface. Keep `docs/specs/kasb-standards-v1.md` as the
  public semantic contract and `docs/research/kasb-standard-source-map.md` as
  observed provider evidence; neither duplicates OpenAPI-owned wire facts.
- Handwrite the Rust conformer. Do not generate Rust models, request builders,
  validators, or decoders from OpenAPI.
- Keep fixtures and expected outcomes independent from the implementation.
  Strengthen the current conformance runner into a process-isolated judge that
  exercises the public Rust SDK, Rust CLI, and Node SDK surfaces and proves it
  rejects deliberate behavioral corruption.
- Keep `wreq`/`wreq-util` exact-versioned and preserve the coherent,
  session-scoped persona, bounded concurrency, cancellation, timeout, cookie,
  proxy-affinity, and source-drift rules proven by the pilot.
- Package the Node binding and Rust CLI binary together for Linux GNU
  x64/ARM64, macOS ARM64, and Windows x64, extending the proven `../ytm` native
  distribution shape. Generate target selection from one manifest. Other npm
  targets remain unclaimed until native build and clean-consumer evidence
  exists. The public Rust crate and CLI may support additional source-build or
  direct-distribution targets without implying npm support.
- Build direct Rust CLI archives and npm target packages from the same release
  artifacts. Do not download or compile native artifacts in npm lifecycle
  scripts or on first execution.
- Keep live KASB checks separate from ordinary deterministic validation. Live
  availability is provider evidence, not contract authority.
- Keep the frozen JavaScript UTF-16 summary limits. The Rust CLI must back up
  to a complete Unicode scalar boundary and remain Unicode-scalar-valid. Only
  the transition TypeScript CLI may emit an escaped lone surrogate at that
  pathological boundary; the intentional replacement difference is covered by
  the CLI process judge.
- Keep publishing, version selection, registry mutation, and changes to KASB
  external state outside the rewrite. Delivery may prepare releasable artifacts
  but cannot publish them without explicit authorization.
- Publish only the sanitized `{ "code": "binding_panic" }` operator event on
  `sjunepark.kasb.native` for a contained native panic. The caller receives the
  public `internal_failure`, and no panic detail or unsolicited stderr crosses
  the Node boundary; subscribers follow Node's requirement not to throw.
- Preserve exact signal identity through the npm launcher where POSIX signal
  semantics exist. On Windows, preserve termination and the remaining process
  contract without claiming exact POSIX signal identity.
- Require glibc 2.28 for Linux GNU x64 and ARM64 npm artifacts. Build on that
  runtime, reject addon or CLI imports requiring newer glibc symbols, and run
  clean packed consumers at the floor before promoting support.

## Delivery plan

### 1. Freeze the baseline and target authorities

- Validate the current npm package, CLI, toolset, Rust pilot, fixtures, and
  conformance controls from a clean `main` baseline.
- Inventory every public operation, input, result, failure, warning, output
  mode, package export, cancellation path, and CLI exit behavior that the
  replacement must preserve or explicitly retire.
- Add and validate the narrow KASB OpenAPI contract from official material and
  bounded source observations. Record any provider rule OpenAPI cannot express
  in one named language-neutral profile rather than hiding it in code.
- Separate independent provider evidence from contract authority and define the
  freshness checks for OpenAPI, fixtures, conformance cases, native manifests,
  generated declarations, and built facade files.
- Turn the current serialized conformance suite into a public-surface judge and
  prove that wrong values, wrong failure categories, serialization changes, and
  source-envelope corruption fail.
- Run a disposable Node-API slice through the existing Rust paragraph path and
  one clean npm consumer. Also prove a minimal npm launcher can resolve a
  platform package and transparently run the same Rust CLI artifact used by a
  direct consumer. Treat cancellation, panic containment, target selection,
  process forwarding, or `wreq`/BoringSSL packaging failures as feasibility
  blockers.
- **Exit gate:** the target authorities, compatibility inventory, adversarial
  judge, binding feasibility, and native support claims are reviewed and have
  no unresolved decision required by the full implementation.

### 2. Complete the public Rust SDK

- Implement `search-standards`, `get-standard-structure`, `get-section`,
  `search-qna`, and `get-qna` as vertical Rust slices alongside the existing
  `get-paragraph` path.
- Keep request validation, source preparation, bounded transport, response
  decoding, normalization, enrichment, ordering, warnings, and typed failures
  inside the Rust crate behind project-owned public types.
- Port only behavior required by the v1 semantic contract and approved
  compatibility inventory. Classify divergences as contract defects, stale
  provider evidence, TypeScript defects, Rust defects, or intentional breaking
  changes rather than copying them automatically.
- Exercise every slice against fixtures, independent expected results, shared
  judge cases, cancellation/timeout behavior, and focused real-transport checks.
- **Exit gate:** the public Rust SDK implements all six v1 capabilities, the
  complete Rust suite and judge pass, and no Node or TypeScript implementation
  is needed to perform a KASB request.

### 3. Build the Rust CLI

- Add `crates/kasb-cli` as a thin `clap` transport over the public requests,
  results, failures, and client composition in `crates/kasb`.
- Preserve approved commands, kebab-case flags, help affordances, JSON
  envelopes, diagnostics separation, cancellation behavior, and exit codes from
  the compatibility inventory; classify intentional differences explicitly.
- Keep KASB URLs, source models, normalization, domain policy, and duplicate
  capability validation out of the CLI crate.
- Test argument parsing without network access and exercise every command as a
  black-box process against deterministic fixtures and deliberate failures.
- Build direct CLI artifacts for every claimed target and verify help, machine
  output, stdin/stdout/stderr behavior, signals where supported, and nonzero
  exit propagation.
- **Exit gate:** the native `kasb` binary passes the public CLI judge on every
  claimed target and contains no independent KASB conformer.

### 4. Build the Rust-backed Node product and npm launcher

- Add a dedicated Node-API crate over `crates/kasb` with asynchronous
  operations, reusable client lifetime, `AbortSignal` cancellation, panic
  containment, and stable serialized failure projection.
- Replace the TypeScript capability/source implementation with a thin Node SDK
  facade that owns public JavaScript ergonomics and network-free discovery and
  validation only.
- Preserve the npm package name, `kasb` binary, and approved SDK/toolset exports.
  Make the JavaScript `bin` entrypoint resolve the exact-version platform
  package and launch its Rust CLI binary without a shell. It must forward
  arguments, environment, working directory, standard streams, signals, and
  exit status without parsing commands or rendering output.
- Generate or reconcile TypeScript declarations, native addon and CLI target
  selection, optional platform-package manifests, support-matrix CI, licenses,
  and package contents from named canonical inputs. Each platform package
  declares its `os`, `cpu`, and Linux `libc` constraints and contains both the
  Node-API addon and same-revision CLI binary.
- Detect unsupported platforms, omitted optional dependencies, version skew,
  missing executable permissions, and spawn failures with concise actionable
  installation diagnostics.
- Before production cutover, add a sanitized operator-side signal for contained
  binding panics through an approved observability channel. It must not expose
  source payloads or panic details to JavaScript and must not write unsolicited
  diagnostics to a consumer's stderr.
- Build every claimed target natively and clean-install the packed root and
  platform packages under each supported Node major.
- **Exit gate:** the packed Node SDK/toolset and npm CLI launcher pass their
  public judge and clean-consumer suite on every claimed target without
  JavaScript KASB transport, source decoding, or CLI behavior.

### 5. Cut over and retire superseded paths

- Promote the Rust CLI, Rust-backed Node facade, npm launcher, and native
  packages to their canonical package paths in one reviewable cutover while
  ordinary Git history remains recoverable.
- Remove the TypeScript HTTP, source-model, capability-execution, and parallel
  validation implementation after parity passes.
- Remove the Pi export, extension entrypoint, package registration, tests, and
  active documentation as the approved breaking surface change.
- Reconcile README, vision, architecture, semantic contract, source evidence,
  package docs, validation commands, CI, live checks, and release documentation
  so each durable concern has one current owner.
- Prove the final judge still rejects deliberate corruption, run complete Rust,
  CLI, and Node validation, inspect exact package contents, and exercise direct
  and npm consumers from the same final artifacts.
- **Exit gate:** one Rust conformer powers the public Rust SDK, Rust CLI, and
  Node SDK; npm only launches the native CLI; no TypeScript KASB conformer,
  JavaScript CLI, or Pi surface remains; all claimed validation and review gates
  pass; publishing remains disabled.

## Completion criteria

- `crates/kasb` publicly implements all six v1 operations and solely owns KASB
  HTTP, source decoding, normalization, domain policy, and capability failures.
- OpenAPI is the validated wire authority; the v1 spec owns public semantics;
  provider research and fixtures remain explicitly independent evidence.
- The Rust `kasb` CLI uses the public SDK and preserves the approved
  automation-facing command and process contract.
- The Node SDK and `@sjunepark/kasb/toolset` preserve their approved contracts
  through the asynchronous Node-API binding.
- The npm `kasb` entrypoint is a transparent, shell-free launcher for the exact
  Rust CLI artifact in the selected platform package.
- The Pi adapter and TypeScript source/capability conformer are absent from the
  active product, package, tests, and documentation.
- The public-surface judge covers all approved operations and proves it detects
  controlled incorrect behavior.
- Every claimed native target builds and passes direct CLI and clean packed npm
  consumer tests; generated declarations, loaders, launchers, manifests, and
  package contents are fresh.
- Deterministic validation, bounded live checks, repository review, and
  delivery review pass, with planning and current documentation reconciled.
- No registry publication, release tag, or external provider mutation occurs.

## Out of scope

- New KASB capabilities or comparison workflows beyond the approved v1
  contract.
- MCP or any replacement for the removed Pi adapter.
- A second CLI parser, renderer, or behavior implementation in JavaScript.
- Runtime native downloads, npm install-time compilation, or a fallback
  JavaScript implementation when the target binary is unavailable.
- Browser, edge, Deno, or Bun-runtime support for the npm package.
- Database persistence, background ingestion, mutation, login, advice, or
  multi-provider abstraction.
- Registry publication, package-version selection, release tags, and external
  KASB state changes.

## Next action

Complete Phase 4 validation and review for the asynchronous Node-API binding,
Node SDK/toolset, immutable native and direct-CLI artifacts, clean consumers,
and transparent npm launcher. After its PR lifecycle is complete, perform the
dependent canonical cutover and retire the TypeScript conformer, JavaScript
CLI behavior, and Pi surface.
