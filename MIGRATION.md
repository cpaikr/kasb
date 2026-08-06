# Rust Migration

Status: approved direction; implementation has not started.

Decision date: 2026-07-30.

## Decision

Add a native Rust SDK and make Rust the primary implementation for high-volume,
browser-profiled requests. Use
[`wreq`](https://github.com/0x676e67/wreq) with
[`wreq-util`](https://github.com/0x676e67/wreq-util) for the Rust HTTP path.

The migration is additive:

- Keep the existing TypeScript SDK, CLI, and Pi adapter supported.
- Add a native Rust SDK with the same public KASB capability semantics.
- Keep the TypeScript and Rust implementations independently usable; neither
  should require the other language's runtime, binary, or FFI layer.
- Preserve the v1 operation names, request/result meaning, typed failures, and
  JSON envelope conventions documented in
  [docs/specs/kasb-standards-v1.md](docs/specs/kasb-standards-v1.md).

The existing TypeScript CLI remains the sole CLI during this migration. A Rust
CLI is not part of the approved scope.

This document records the approved transition direction. Before Rust code or
the workspace reorganization lands, update `VISION.md`, `ARCHITECTURE.md`, and
the repository command guidance so their TypeScript-only descriptions reflect
the active phase of the migration.

## Rationale

Rust aligns the high-volume request engine with the planned Rust SDK, allowing
the SDK to use the request implementation directly rather than crossing a Go
service or FFI boundary.

`wreq` was selected over Go
[`tls-client`](https://github.com/bogdanfinn/tls-client) because it provides:

- native Rust integration;
- coordinated TLS, HTTP/1, HTTP/2, and header emulation;
- maintained browser and device profiles through `wreq-util`;
- reusable async clients, connection pooling, proxy support, cookies, and Tower
  middleware suitable for controlled high concurrency.

The accepted tradeoffs are:

- `wreq` and `wreq-util` are currently release-candidate dependencies, so exact
  versions must be pinned and upgrades must pass fingerprint and conformance
  tests;
- BoringSSL introduces native build and linker considerations;
- the inspected `wreq` release does not provide the operational HTTP/3 and QUIC
  fingerprinting available in `tls-client`.

HTTP/3 is not a current KASB requirement. If it becomes one, reassess the Rust
transport dependency then; do not add an unused alternate transport now.

## Public Surfaces

| Surface | Runtime | Responsibility |
| --- | --- | --- |
| TypeScript SDK | Node.js/Bun | Existing neutral toolset and typed TypeScript API |
| CLI | Node.js | Existing `kasb` command and JSON output contract |
| Pi adapter | Node.js/Bun | Existing Pi integration over the TypeScript toolset |
| Rust SDK | Rust | Native API and high-volume browser-profiled request path |

Both SDKs implement the same domain operations. They share behavioral evidence
and compatibility tests, not runtime internals.

## Target Repository Organization

Move toward this layout before adding substantial Rust implementation:

```text
kasb/
|-- packages/
|   `-- kasb-ts/          # existing npm SDK, CLI, and Pi adapter
|       |-- src/
|       |-- test/
|       |-- scripts/
|       `-- package.json
|-- crates/
|   `-- kasb/             # Rust SDK; one crate until a real split is needed
|       |-- src/
|       `-- Cargo.toml
|-- fixtures/             # shared captured KASB source responses
|-- conformance/          # language-neutral request/result cases
|-- evals/                # end-to-end behavioral scenarios
|-- docs/                 # product, source, and contract documentation
|-- ARCHITECTURE.md
|-- MIGRATION.md
`-- VISION.md
```

Keep one Rust crate initially. Organize it with internal modules rather than
premature workspace crates:

```text
crates/kasb/src/
|-- lib.rs                # public Rust SDK entry point
|-- capabilities/         # public requests, results, validation, execution
|-- sources/kasb/         # URLs, source models, fetching, normalization
`-- http/                 # wreq clients, personas, pooling, request policy
```

The repository reorganization is a behavior-preserving migration step. Move the
current TypeScript package as one unit and keep its npm package name, exports,
CLI binary, and Pi entrypoint unchanged.

## Shared Contract Strategy

The two implementations must not become separate products with similar names.
Use these shared authorities:

- `docs/specs/kasb-standards-v1.md` defines semantic behavior.
- `fixtures/` contains captured upstream responses.
- `conformance/` contains language-neutral inputs and expected public outputs or
  typed failures.
- `evals/` verifies representative workflows across public surfaces.

TypeScript may continue using Effect Schema and Rust should use native Rust
types and validation. Do not generate one SDK's public API mechanically from the
other. Compatibility is enforced at the serialized contract boundary.

Each implementation may have runtime-specific metadata only when the public
contract explicitly permits it. Source identifiers and raw KASB response shapes
remain internal in both languages.

## Runtime Boundaries

```text
TypeScript CLI / Pi / SDK
    -> TypeScript capabilities
    -> TypeScript KASB source adapter
    -> native fetch

Rust SDK
    -> Rust capabilities
    -> Rust KASB source adapter
    -> wreq persona client
```

Transport-specific code must stay below the capability boundary. CLI parsing,
Pi wrapping, and Rust API ergonomics must not leak into KASB source models.

## Browser Persona Model

The Rust request path should treat a browser identity as a session, not a
per-request random value. A persona owns:

- one coherent `wreq-util` emulation profile;
- request-context headers appropriate to navigation or API fetches;
- a long-lived `wreq::Client` and its connection pool;
- cookie state;
- optional proxy affinity;
- concurrency and rate limits;
- a session lifetime and rotation policy.

Reuse a persona across related requests and rotate only at session boundaries.
Do not combine an emulated transport profile with contradictory user-agent,
client-hint, or `Sec-Fetch-*` headers. Model the default KASB JSON request
context separately from browser navigation headers.

Fingerprint emulation does not execute JavaScript or reproduce browser-only
state. Keep that limitation explicit rather than treating `wreq` as browser
automation.

## Adapted Migration Method

The execution method selectively adapts Anthropic's
[Claude Code Migration Kit](https://github.com/anthropics/code-migration-kit-with-claude-code/blob/cf91c9d5068d9aaf95a36164169f08c3e636c909/README.md).
That kit is primarily designed for total, structure-preserving language ports.
This migration instead adds a separately released Rust implementation while the
TypeScript implementation remains supported.

Adopt these practices:

- establish and validate the behavioral judge before Rust implementation;
- record cross-language translation decisions once in a rulebook;
- complete one representative vertical pilot before implementing every
  capability; and
- end each phase at an evidence-backed gate before starting the next phase.

The approved decision and rationale in this document serve as the feasibility
gate. Reopen that decision if its transport, platform, verification, or
independent-release assumptions fail during the pilot.

Do not adopt the kit's file-by-file translation queue, delayed survey-build
loop, large translation fan-out, or eventual deletion of the source-language
implementation. Compile and test each Rust capability as it lands.

The v1 spec is the normative semantic authority. The TypeScript implementation
is an executable reference and regression comparator, not the specification by
itself. When the spec, source evidence, and TypeScript behavior disagree,
classify and resolve the discrepancy explicitly rather than automatically
reproducing a TypeScript defect in Rust.

When implementation starts, keep the execution evidence under
`docs/plans/rust-migration/`:

- `rulebook.md` records durable TypeScript-to-Rust mapping decisions;
- `parity.md` records judge coverage, validation, baselines, and discrepancy
  resolutions;
- `progress.md` records the current gate, pilot findings, validation, blockers,
  and next step.

## Migration Sequence

Do not begin a phase until the preceding exit gate is satisfied and its evidence
is recorded.

1. **Freeze compatibility evidence and validate the judge**
   - Promote the approved multi-language product shape into `VISION.md` and
     `ARCHITECTURE.md` before implementation begins.
   - Record representative success and failure envelopes for every v1
     operation.
   - Separate language-neutral conformance cases from TypeScript-runner-specific
     tests and run them against the TypeScript baseline.
   - Prove that the judge rejects controlled known-bad results, including a
     wrong success value, a wrong typed failure, and a serialization mismatch.
   - **Exit gate:** `parity.md` records the scenario inventory, passing baseline
     counts, and evidence that each controlled divergence was detected.

2. **Write the translation rulebook**
   - Inventory every v1 operation, public request/result type, source endpoint,
     typed failure, fixture family, and cancellation path.
   - Decide Rust mappings for validation, error variants, cancellation and
     timeouts, retry policy, ordering, optional values, JSON serialization,
     source drift, and HTML normalization.
   - Record `wreq` persona ownership, proxy and cookie affinity, concurrency,
     and rotation rules.
   - Update the rulebook when a pilot or later capability exposes a recurring
     ambiguity; do not resolve the same translation question independently in
     multiple modules.
   - **Exit gate:** `rulebook.md` covers the inventory and has no unresolved
     decision required by the pilot.

3. **Create the workspace layout**
   - Move the existing TypeScript package under `packages/kasb-ts/` without
     changing behavior or published entrypoints.
   - Add the root Cargo workspace and the single `crates/kasb/` SDK crate.
   - Keep shared fixtures, conformance cases, evals, and documentation at the
     repository root.
   - **Exit gate:** the npm package, CLI, Pi adapter, and package exports retain
     their existing behavior; both package roots build and test independently.

4. **Run one vertical pilot**
   - Implement `get-paragraph` through the complete Rust path: public types,
     validation, typed failures, KASB source model, URL construction,
     normalization, and a reusable `wreq` persona client.
   - Pin exact dependency versions.
   - Exercise success, not-found, invalid-input, source-drift, timeout, and
     cancellation behavior against fixtures and the shared judge.
   - Review every TypeScript/Rust difference, update the rulebook, and rerun the
     judge before expanding the implementation.
   - **Exit gate:** the pilot passes its conformance cases, the TypeScript
     baseline remains green, controlled known-bad results still fail, and no
     pilot mapping decision remains unresolved.

5. **Implement the remaining Rust capabilities**
   - Implement each remaining operation as a vertical capability slice across
     public types, source adaptation, normalization, and errors.
   - Compile, test, and run the relevant shared conformance cases within every
     slice rather than deferring feedback to a repository-wide survey build.
   - Add or amend a rule when reviews find a recurring mismatch class.
   - **Exit gate:** every approved v1 operation is implemented and passes its
     fixture-backed and conformance cases in both languages.

6. **Establish parity and operational evidence**
   - Run both SDKs against the shared fixtures and conformance cases.
   - Classify every difference as a spec defect, stale source evidence,
     TypeScript defect, Rust defect, or explicitly permitted runtime metadata.
   - Run opt-in live checks separately because upstream KASB behavior can drift.
   - Define the representative workload and acceptance thresholds before
     measuring performance.
   - Run bounded load tests that record throughput, latency, memory, connection
     use, and error rates across representative persona mixes.
   - Run fingerprint checks for every supported profile family.
   - Treat observable contract differences as migration blockers.
   - **Exit gate:** `parity.md` records zero unexplained contract differences,
     passing live-check results or explained upstream drift, supported
     fingerprint profiles, and accepted load-test baselines.

7. **Release independently**
   - Continue publishing the npm package and CLI.
   - Publish the Rust crate separately once its API and conformance suite are
     stable.
   - Version each package independently while declaring the same supported KASB
     contract version.
   - **Exit gate:** each package can be built, tested, installed, and released
     without the other language's runtime or artifacts.

## Invariants

- The TypeScript SDK, CLI, and Pi adapter remain supported and independently
  installable.
- The Rust SDK is a native Rust API, not a wrapper around the TypeScript CLI.
- The v1 spec is normative; TypeScript behavior is reference evidence, not an
  authority for carrying defects into Rust.
- The CLI stays thin and does not own domain or source behavior.
- TypeScript and Rust use the same operation semantics and serialized envelopes.
- Shared fixtures and conformance cases are not copied into language-specific
  directories.
- KASB source quirks remain inside each `sources/kasb/` boundary.
- Browser personas are coherent, session-scoped, and reuse connections.
- Concurrency is bounded; requests support timeout and cancellation; retries
  are bounded and respect explicit rate-limit responses.
- No database, background ingestion, browser automation, or additional host
  adapter is introduced by this migration.

## Completion Criteria

The migration is complete when:

- the repository has distinct TypeScript and Rust package roots;
- the existing npm SDK, CLI, and Pi behavior remains compatible;
- the Rust SDK implements every approved v1 operation;
- both SDKs pass the shared fixture and conformance suite;
- the shared judge has demonstrated that it rejects controlled contract
  divergences rather than merely passing both implementations;
- the translation rulebook and parity record contain no unresolved decisions or
  unexplained behavioral differences;
- the Rust request path supports controlled high concurrency and multiple
  coherent browser persona families, with load-test evidence;
- dependency pinning, supported platforms, and BoringSSL build requirements are
  documented; and
- each public package can be built, tested, and released independently.
