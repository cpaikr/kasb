# KASB Standards Vision

## Product

- `name`: `kasb-standards`
- `status`: Rust SDK complete; TypeScript transition product retained pending
  cutover (see [MIGRATION.md](MIGRATION.md))
- `domain`: Korean accounting standards and related interpretation material
  exposed through KASB public read surfaces
- `users`: LLM agents, agent developers, researchers, and humans who need
  reliable SDK or CLI access to standards content

## Goal

Provide a public Rust SDK, Rust-backed Node SDK, and first-class Rust CLI for
deterministic search and retrieval from `https://db.kasb.or.kr/` without
browser automation.

The target experience is closer to `yfinance` than browsing:

- small semantic operations;
- predictable structured results and typed failures;
- stable identifiers, references, and source metadata;
- a native Rust API for direct embedding;
- a parseable Rust `clap` CLI, also installable through an npm launcher;
- an asynchronous Node SDK and neutral npm toolset; and
- one Rust implementation of provider and domain behavior behind every public
  surface.

## Product Shape

The approved v1 operations remain:

- search standards by keyword;
- retrieve the structural index for a standard;
- fetch one section by KASB's retrieval-facing section id;
- fetch one exact paragraph by standard and paragraph number;
- search KASB Q&A material by keyword; and
- fetch one Q&A document by document number.

`crates/kasb` is both the supported public Rust SDK and the sole KASB conformer.
The Node SDK delegates execution through a narrow asynchronous Node-API
binding. Its JavaScript layer owns only public ergonomics, side-effect-free
discovery and validation, target selection, and transparent CLI process launch.
The Rust `clap` CLI depends on the public SDK and owns all command parsing,
presentation, help, and process behavior.

The npm package provides:

- the Node SDK and `@sjunepark/kasb/toolset`;
- a `kasb` JavaScript launcher for the packaged Rust CLI binary; and
- machine-readable success and failure behavior.

The Pi export and extension are removed at cutover and receive no replacement
host adapter in this rewrite.

## Principles

- `one conformer`: Rust alone owns KASB URLs, request preparation, transport
  policy, source decoding, normalization, enrichment, and capability failures.
- `public Rust`: the core remains an idiomatic, independently usable Rust SDK,
  not an implementation detail of Node.
- `thin Node boundary`: Node-API and JavaScript project stable Rust results into
  the existing npm contracts without acquiring source rules.
- `one CLI implementation`: the Rust `clap` binary owns command behavior;
  npm only selects and launches the matching packaged binary.
- `reference first`: every returned item is easy to cite and revisit.
- `structured over prose`: operations return typed records, not generated
  explanations.
- `canonical authorities`: OpenAPI owns supported wire facts, the v1 spec owns
  public semantics, and provider research and fixtures remain independent
  evidence.
- `boundary-owned errors`: dependency failures and unrestricted provider
  payloads never cross public boundaries.
- `bounded execution`: timeouts, response sizes, retries, concurrency,
  cancellation, and persona lifetime are explicit.
- `verified distribution`: support claims require real native artifacts and
  clean packed-consumer evidence.
- `public-read first`: v1 remains read-only and unauthenticated unless provider
  evidence supports a later product decision.

## v1 Boundaries

### In scope

- the six approved read-only KASB operations;
- stable standard, section, paragraph, and Q&A references;
- source metadata, warnings, and typed failures;
- a public native Rust SDK;
- a first-class Rust `clap` CLI over that SDK;
- an asynchronous Node-API binding;
- the existing npm identity, Node SDK, neutral toolset, and transparent Rust CLI
  launcher;
- a language-neutral KASB OpenAPI wire contract;
- independent fixtures, conformance cases, and an adversarial public-surface
  judge; and
- claimed native npm packages only for verified targets.

### Out of scope

- legal, accounting, or investment advice;
- answer generation inside the tool;
- mutation, posting, login, or account workflows;
- browser automation as the primary access method;
- database persistence or background ingestion;
- the Pi adapter, MCP, or another host-specific adapter;
- a second CLI implementation in JavaScript;
- a second TypeScript KASB conformer;
- browser, edge, Deno, or Bun-runtime npm support;
- premature multi-source abstraction; and
- publication or external provider changes without explicit authorization.

## Success Criteria

The product succeeds when an agent or human can reliably find, retrieve, and
cite KASB material through the public Rust SDK, Rust CLI, or Rust-backed Node
SDK, and when all projections agree on the approved serialized semantics.

The rewrite succeeds when:

- Rust implements every v1 operation and no JavaScript module performs KASB
  transport or source decoding;
- the Rust CLI preserves approved automation behavior directly over the SDK;
- the Node SDK and toolset preserve approved public behavior through Node-API;
- the npm `kasb` launcher transparently preserves the Rust CLI process contract;
- OpenAPI, semantic specs, provider evidence, and derived artifacts have clear
  non-overlapping ownership;
- the judge rejects controlled wrong behavior;
- every claimed native target passes clean packed-consumer tests; and
- the TypeScript conformer and Pi surface are absent after cutover.

## Current State

[MIGRATION.md](MIGRATION.md) owns authoritative transition status.
[plans/rust-node-rewrite.md](plans/rust-node-rewrite.md) owns the approved
sequence and exit gates. This document owns the enduring product scope and
success criteria.

## Later Product Questions

These are not rewrite prerequisites:

- how much paragraph HTML should be normalized beyond the existing contract;
- whether interpretation materials need additional capabilities;
- whether user-facing route URLs can be derived safely; and
- whether framework-aware comparison belongs in a later public operation.
