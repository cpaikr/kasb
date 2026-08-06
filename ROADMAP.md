# Roadmap

This roadmap records the path from docs-only planning to the first Darty-shaped tool package implementation. It is historical context plus broad release direction; use [TODO.md](TODO.md) for active work.

## Active Goal Overlay

The repository is executing migration phases 1–4 through
[`goals/rust-migration-foundation-pilot.md`](goals/rust-migration-foundation-pilot.md).
That active closed-scope goal currently takes precedence for execution while the unrelated
hardening and product ideas in `TODO.md` remain the project queue. Migration
phase 5 remaining Rust capabilities is explicitly outside the active goal.

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

- `./toolset` export with operation discovery, command help, validation, execution dispatch, cancellation, and error serialization
- reusable package contract centered on the `kasb` CLI plus `@sjunepark/kasb/toolset`
- retained `./pi` export and Pi extension entrypoint as a product-specific adapter wrapping the neutral toolset as one action-oriented tool
- package metadata for CLI, toolset, Pi exports, and Pi extension registration
- build output for ESM library modules and declaration files
- tool-surface and package-smoke tests for the neutral SDK, packed package import, and retained Pi action envelope
- English-native package copy that preserves source-native Korean terms where they identify KASB material

## Current Phase: Hardening And Release Readiness

Focus:

- broaden contract, validation, source-drift, CLI entrypoint, neutral toolset, package-smoke, and retained Pi-adapter coverage
- keep opt-in live checks gated by `LIVE_KASB_TESTS=1`
- add CLI examples after command behavior settles
- keep package export/import smoke checks current before publishing the CLI/tool package

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
