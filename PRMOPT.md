# PRMOPT

This file is historical implementation context for the first CLI scaffold. Current architecture, contracts, and active work are authoritative in [ARCHITECTURE.md](ARCHITECTURE.md), [docs/specs/](docs/specs/README.md), [TODO.md](TODO.md), [PLAN.md](PLAN.md), and code.

The project follows `../darty` unless a KASB-specific constraint justifies a different path.

## What We Need To Build

The tool should:

- talk directly to `https://db.kasb.or.kr/api/`
- expose typed capabilities for standards search, structure lookup, section retrieval, paragraph retrieval, Q&A search, and Q&A document retrieval
- validate public semantic requests with Effect Schema
- export JSON Schemas from the same contracts used at runtime
- normalize upstream responses into traceable success envelopes
- surface typed failures for invalid input, missing ids, source unavailability, source drift, and partial retrieval
- provide a thin Commander CLI over the shared capability core
- emit JSON for CLI operation results: success envelopes on `stdout`, failure envelopes on `stderr`

## Accepted Stack

Follow `../darty` for the core app shape:

- Bun for runtime, package management, and scripts
- strict TypeScript
- Effect Schema for public contracts, runtime validation, and JSON Schema export
- Commander for CLI transport
- Bun test runner
- native `fetch` for KASB JSON API calls
- success-only result schemas plus typed failures
- JSON CLI operation output, including failures
- CLI help/examples/output controls kept transport-local; Commander help remains human-readable

KASB-specific handling:

- paragraph HTML handling where the KASB API returns HTML fragments
- source drift detection for changing public API payloads
- opt-in live checks for public endpoint behavior

## Naming Decisions

- Public JSON fields use camelCase semantic names: `keyword`, `stdNum`, `indexDocumentId`, `paraNum`.
- KASB source parameters such as `searchWord` stay inside source adapters.
- CLI command names use kebab-case: `search-standards`, `get-standard-structure`, `get-section`, `get-paragraph`, `search-qnas`, `get-qna`.
- CLI flags use kebab-case: `--keyword`, `--std-num`, `--index-document-id`, `--para-num`, `--doc-number`.
- TypeScript names should follow the established implementation style; do not lock new function names in docs before code establishes them.

## Target Layout

```text
src/
  app/
  capabilities/
  cli.ts
  cli/
  sources/kasb/
fixtures/
test/
  cli/
  live/
evals/
```

Use [ARCHITECTURE.md](ARCHITECTURE.md) for layer boundaries. Avoid locking new exact files in docs before the implementation establishes a stable convention.

## Capability Pattern

Each operation should mirror Darty's boundary split without copying unnecessary detail upfront:

- public request/result contracts and JSON Schema export
- execution and typed failure mapping
- provider interface between capability and source adapter
- transport-local CLI descriptions, flags, examples, and output controls

Keep docs aligned with exact file names only where the code has established a stable convention.

## Source Adapter Pattern

KASB source code should live under `src/sources/kasb/` and own:

- endpoint URL construction
- source response schemas
- fetch behavior and timeouts
- raw KASB identifier handling
- normalization into provider-facing results
- source errors such as unavailable, changed, not found, or partial response

Public capabilities should not import raw KASB source models. Source adapters may expose provider implementations that satisfy capability provider interfaces.

## Testing Direction

Match Darty's verification layers:

1. colocated deterministic tests for contracts, specs, execute paths, source normalization, and known identifier pitfalls
2. fixture-backed source tests for KASB API responses
3. subprocess CLI smoke tests under `test/cli/` once the CLI exists
4. subprocess CLI tests that assert `stdout`, `stderr`, and exit-code behavior for success and failure
5. opt-in live checks under `test/live/`, gated by `LIVE_KASB_TESTS=1`
6. capability-scoped evals under `evals/` only after CLI behavior stabilizes

## Rejected Or Deferred Options

### Python-first implementation

Rejected for now. It weakens parity with `../darty`, splits runtime reuse, and adds schema duplication pressure.

### MCP, SDK, or Pi-native adapters

Rejected for this repo's current product direction. The public interface is CLI-only.

### Database persistence or background ingestion

Rejected for this repo's current product direction. This repo should retrieve and normalize KASB standards on demand through the CLI, not maintain a local corpus.

### Browser automation

Rejected as the primary implementation path. Browser observations are useful for source investigation, but the tool should call the public KASB API directly.

## Current Implementation State

The Bun/TypeScript repo-local implementation now exists:

- root package files and real scripts
- Darty-shaped `src/` roots for app composition, capabilities, CLI, and KASB source adapters
- standards and Q&A capabilities
- captured KASB fixtures and fixture-backed tests
- subprocess CLI tests and gated live checks

Use [PLAN.md](PLAN.md) and [TODO.md](TODO.md) for active hardening work.
