# Plan

Current job: bootstrap the Darty-shaped CLI implementation for `kasb-standards`.

## Goal

Turn the v1 KASB contract into a real Bun/TypeScript CLI implementation layout that mirrors `../darty`.

## Deliverable

- a root repo scaffold with `src/`, `fixtures/`, `test/`, and `evals/`
- a source tree split into app composition, capabilities, CLI transport, and KASB source adapters
- initial fixture files for the four v1 operations
- first Effect Schema contracts and typed failure boundaries for `search-standards`, `get-standard-structure`, `get-section`, and `get-paragraph`

## Decisions

- follow `../darty` for app design and technical defaults
- use Bun and strict TypeScript
- use Effect Schema for request/result contracts and JSON Schema export
- use Commander for CLI transport
- use Bun test runner
- use native `fetch` for KASB API calls
- use success-only result envelopes plus separate typed failures
- keep raw KASB source models internal to `sources/kasb`
- keep the public product CLI-only

## In Scope

- root package scaffold needed to start implementation
- `src` layer roots for the first implementation slice
- capability contract boundaries for the four v1 operations
- KASB fixture capture for search, structure, section, and paragraph retrieval
- deterministic tests around known identifier risks
- Commander CLI commands for the four v1 operations

## Out Of Scope

- MCP adapter work
- SDK packaging
- Pi-native adapter work
- database persistence or background ingestion
- answer generation or accounting interpretation
- mutation, login, or account flows
- broad interpretation-material coverage

## Inputs

- `../darty/ARCHITECTURE.md`
- `../darty/src/ARCHITECTURE.md`
- `../darty/src/`
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [docs/specs/kasb-standards-v1.md](docs/specs/kasb-standards-v1.md)
- [docs/research/kasb-standard-source-map.md](docs/research/kasb-standard-source-map.md)
- [PRMOPT.md](PRMOPT.md)

## Work Plan

1. Scaffold root Bun/TypeScript project files using only real scripts.
2. Create the Darty-style layer roots needed for app composition, capabilities, CLI, and KASB source access.
3. Implement one capability path first, then repeat the pattern only when it is proven by code.
4. Capture fixture responses from the live KASB API for the v1 scenarios.
5. Define shared contract, validation, and typed failure boundaries as they become necessary.
6. Implement source adapters and normalizers for the four KASB endpoint families.
7. Add deterministic tests for JSON Schema shape, source normalization, and identifier mismatch behavior.
8. Add the Commander CLI once the core execution path works.
9. Add subprocess CLI smoke tests for all four v1 commands.

## Exit Criteria

- the repo has a clear Darty-shaped implementation location
- the first capability path establishes a repeatable pattern for the remaining v1 operations
- internal source ids and route-only ids are isolated from public contracts; promoted KASB ids remain explicit
- CLI commands are thin over the shared app/capability layer
- CLI success and failure paths are always JSON and covered by subprocess tests
- fixture-backed implementation can continue without revisiting the app architecture
