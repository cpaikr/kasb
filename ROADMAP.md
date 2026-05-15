# Roadmap

Recommendation: move from the outdated docs-only shape to a Darty-shaped CLI implementation. Keep the first release read-only, citation-focused, and backed by fixtures.

## Phase 0: Darty Parity Reset

Deliverables:

- docs state that `kasb-standards` follows `../darty`
- accepted stack is Bun, strict TypeScript, Effect Schema, Commander, Bun test, and native fetch
- public contract naming is camelCase JSON plus kebab-case CLI
- TODO and PLAN point to implementation bootstrap, not open-ended design

## Phase 1: Scaffold Core Shape

Deliverables:

- root package files needed for Bun and TypeScript
- `src/app`, `src/capabilities`, `src/cli`, and `src/sources/kasb`
- capability directories for `search-standards`, `get-standard-structure`, `get-section`, and `get-paragraph`
- initial fixtures directory and test convention

## Phase 2: Implement v1 Capability Contracts

Deliverables:

- Effect Schema request/result contracts
- JSON Schema exports from the runtime contracts
- request resolution and typed failures
- provider interfaces
- source adapter skeletons against `https://db.kasb.or.kr/api/`

## Phase 3: Source Fixtures And Core Retrieval

Deliverables:

- fixture responses for `/api/standard`, `/api/standard-indexes`, `/api/paragraphs`, and `/api/paragraphs/content`
- deterministic source normalizer tests
- implementation of the four read-only operations
- tests for `titleDocumentId` versus `indexDocumentId` pitfalls

## Phase 4: CLI Transport

Deliverables:

- Commander root CLI
- command files for the four v1 operations
- JSON success envelope on `stdout`
- JSON failure envelope on `stderr` with nonzero exit code and empty `stdout`
- `--pretty` and diagnostic controls as needed without breaking parseable output
- subprocess CLI smoke tests

## Phase 5: Hardening And Evals

Deliverables:

- opt-in live checks gated by `LIVE_KASB_TESTS=1`
- scenario evals for citation-oriented retrieval
- source drift notes and recovery guidance
- packaging review if the CLI should be published

## Intentional Deferrals

- MCP, Pi-native tools, or SDK packages
- database persistence or background ingestion
- broad multi-source abstraction
- mutation, login, or account flows
- legal or accounting interpretation features
- full interpretation-material coverage unless a later spec adopts it
