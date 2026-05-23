# Roadmap

This roadmap records the path from docs-only planning to the first Darty-shaped tool package implementation. It is historical context plus broad release direction; use [TODO.md](TODO.md) for active work.

## Completed

### Phase 0: Darty Parity Reset

Delivered:

- docs state that `kasb-standards` follows `../darty`
- accepted stack is Bun, strict TypeScript, Effect Schema, Commander, Bun test, and native fetch
- public contract naming is camelCase JSON plus kebab-case CLI
- TODO points to implementation hardening rather than open-ended design

### Phase 1: Scaffold Core Shape

Delivered:

- root package files needed for Bun and TypeScript
- `src/app`, `src/capabilities`, `src/cli`, and `src/sources/kasb`
- capability directories for standards and Q&A operations
- fixtures directory and test convention

### Phase 2: Implement v1 Capability Contracts

Delivered:

- Effect Schema request/result contracts
- JSON Schema exports from the runtime contracts
- request resolution and typed failures
- provider interfaces
- source adapter implementation against `https://db.kasb.or.kr/api/`

### Phase 3: Source Fixtures And Core Retrieval

Delivered:

- fixture responses for standards search, structure lookup, section retrieval, paragraph retrieval, Q&A search, and Q&A detail retrieval
- deterministic source/provider tests
- implementation of the six read-only operations
- tests for `titleDocumentId` versus `indexDocumentId` pitfalls

### Phase 4: CLI Transport

Delivered:

- Commander root CLI
- commands for the six v1 operations
- JSON success envelope on `stdout`
- JSON failure envelope on `stdout` with nonzero exit code
- `--pretty` output without breaking parseable JSON
- subprocess CLI smoke tests

### Phase 5: Tool Package Surfaces

Delivered:

- `./toolset` export with operation discovery, command help, validation, execution dispatch, and error serialization
- `./pi` export and Pi extension entrypoint wrapping the neutral toolset as one action-oriented tool
- package metadata for CLI, toolset, Pi exports, and Pi extension registration
- build output for ESM library modules and declaration files
- tool-surface tests for neutral and Pi action envelopes
- Korean user-facing copy across neutral toolset, Pi guidance, operation specs, JSON Schema descriptions, and CLI structured failures

## Current Phase: Hardening And Release Readiness

Focus:

- broaden contract, validation, source-drift, CLI entrypoint, toolset, and Pi coverage
- keep opt-in live checks gated by `LIVE_KASB_TESTS=1`
- add CLI examples after command behavior settles
- review packaging before publishing the CLI/tool package

## Later

- capability-scoped scenario evals for citation-oriented retrieval
- best-effort user-facing route URLs only if they can be derived safely
- richer Q&A type semantics only if source evidence supports stable names

## Intentional Deferrals

- MCP or additional host adapters beyond Pi
- database persistence or background ingestion
- broad multi-source abstraction
- mutation, login, or account flows
- legal or accounting interpretation features
- full interpretation-material coverage unless a later spec adopts it
