# KASB Standards Vision

## Product

- `name`: `kasb-standards`
- `status`: TypeScript package implemented; additive Rust SDK migration phases 1–4 in progress
- `domain`: Korean accounting standards and related interpretation material exposed through KASB public read surfaces
- `users`: LLM agents, agent developers, researchers, and humans who need reliable SDK or CLI access to standards content

## Goal

Build independently usable TypeScript and Rust SDKs, plus the existing Node.js
CLI, that give agents and humans a stable, programmatic way to search and
retrieve Korean accounting standards from `https://db.kasb.or.kr/`.

The target experience should be closer to `yfinance` than browser automation:

- small semantic operations
- predictable structured results
- stable identifiers and references
- easy local scripting through a CLI
- parseable JSON for both success and failure paths
- independently usable TypeScript and Rust implementations sharing one serialized semantic contract
- a reusable neutral TypeScript toolset behind CLI and Pi surfaces so behavior is testable and not tied to one transport

## Why This Exists

Generic browsing is a poor interface for standards research:

- agents spend too many steps navigating UI flows
- answers are harder to verify without stable standard, section, and paragraph references
- repeated lookups are slow and brittle
- the useful source surface is a JSON API, but the browser routes expose different identifiers
- unstructured HTML fragments force the model to infer document structure

This is worth standardizing because standards work is repetitive, citation-sensitive, and benefits from deterministic retrieval.

## Product Shape

The v1 product exposes a narrow set of read-only capabilities through the
TypeScript SDK, native Rust SDK, Node.js CLI, and retained Pi adapter:

- search standards by keyword
- retrieve the structural index for a standard
- fetch one section by KASB's retrieval-facing section id
- fetch one exact paragraph by standard number and paragraph number
- search KASB Q&A material by keyword
- fetch one Q&A document by document number
- return source URLs, stable references, and warnings for source drift or partial normalization

## Principles

- `dual-sdk`: TypeScript and Rust use native language APIs and the same serialized capability semantics
- `tool-package`: CLI, neutral TypeScript toolset, and Pi adapter share the TypeScript capability implementation
- `reference first`: every returned item should be easy to cite and revisit
- `discovery and retrieval`: search alone is not enough
- `structured over prose`: return typed records, not generated explanations
- `source-explicit`: state which KASB endpoint produced the result
- `kasb-shaped first`: model KASB standards, sections, paragraphs, and identifiers before adding generic abstractions
- `transport-light`: keep transport code below each capability boundary; let CLI and Pi stay thin
- `public-read first`: v1 targets public read-only access only

## v1 Boundaries

### In Scope

- read-only access to public KASB standards content
- stable references to standards, sections, and paragraphs where possible
- source metadata that makes results verifiable
- a supported Bun/TypeScript capability core following `../darty`
- a native Rust SDK with the same v1 operation, result, and typed-failure semantics
- shared fixture and conformance evidence at the serialized contract boundary
- a Commander CLI as the human/debuggable transport
- a runtime-neutral `./toolset` export for operation discovery, validation, execution, and error serialization
- a Pi adapter export and extension entrypoint wrapping the neutral toolset as one action-oriented tool

### Out Of Scope

- legal, accounting, or investment advice
- answer generation inside the tool
- mutation, posting, login, or account workflows
- browser automation as the primary access method
- database persistence or background ingestion
- MCP or other host adapters beyond Pi
- a separate Rust CLI
- FFI or a runtime dependency between the TypeScript and Rust SDKs
- premature multi-source abstraction

## Expected Output Shape

Public operations should use a success envelope with:

- `result`: operation payload
- `metadata`: source endpoint, timing, source version or observed behavior notes, completeness flags
- `references`: `stdNum`, `indexDocumentId`, `paraNum`, `uniqueKey`, section path, and source API URL where available
- `warnings`: partial matches, normalization uncertainty, empty sections, source drift, fallback use

Typed failures are separate from the success schema. In the CLI, failures should still be JSON: a failure envelope on `stdout` with a nonzero exit code.

## Success Criteria

The product is successful when an agent or human can reliably:

- find the standard most relevant to a concept
- retrieve the exact paragraph discussing that concept
- cite the standard and paragraph number in an answer
- traverse from search result to structure to section to paragraph with low command overhead
- compare related paragraphs without falling back to browser navigation

## Current State

- The KASB API source map is documented in [docs/research/kasb-standard-source-map.md](docs/research/kasb-standard-source-map.md).
- The v1 public contract is documented in [docs/specs/kasb-standards-v1.md](docs/specs/kasb-standards-v1.md).
- The implementation follows `../darty`'s layer split; see [ARCHITECTURE.md](ARCHITECTURE.md).
- The first Bun/TypeScript package version exists with CLI, neutral toolset, Pi adapter, standards and Q&A operations, fixture-backed tests, and gated live checks.
- The approved additive Rust direction and phase gates are recorded in
  [MIGRATION.md](MIGRATION.md); shared conformance evidence is established
  before the workspace move and Rust pilot.

## Remaining Product Questions

These are not blockers for the first implementation slice:

- how much paragraph HTML should be sanitized or converted beyond raw and plain text fields
- whether interpretation materials belong in v1 or a later capability
- whether user-facing route URLs are worth adding after API URLs are stable
