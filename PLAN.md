# Plan

Current job: harden the Darty-shaped CLI implementation for `kasb-standards`.

## Goal

Harden the implemented Bun/TypeScript CLI so it remains reliable, Darty-shaped, and focused on KASB standards and Q&A read APIs.

## Implemented

- Root Bun/TypeScript package files with real scripts.
- Darty-style layer roots:
  - `src/app/`
  - `src/capabilities/`
  - `src/cli.ts` and `src/cli/`
  - `src/sources/kasb/`
- Standards capabilities:
  - `search-standards`
  - `get-standard-structure`
  - `get-section`
  - `get-paragraph`
- Q&A capabilities:
  - `search-qnas`
  - `get-qna`
- Captured KASB fixtures under `fixtures/kasb/`.
- Fixture-backed provider tests and CLI failure/help tests.
- Gated live traversal test under `test/live/`.

## Decisions

- follow `../darty` for app design and technical defaults
- use Bun and strict TypeScript
- use Effect Schema for request/result contracts and JSON Schema export
- use Commander for CLI transport
- use Bun test runner
- use native `fetch` for KASB API calls
- use success-only result envelopes plus separate typed failures
- keep raw KASB source models internal to `sources/kasb`
- write CLI success JSON to `stdout` and failure JSON to `stderr`
- keep the public product CLI-only

## Next Work Plan

1. Finish the current review and hardening pass without changing the public product shape.
2. Keep JSON Schema export, request validation, source drift, and CLI entrypoint coverage green as fixes land.
3. Add only focused source normalization tests when a concrete KASB drift assumption is discovered.
4. Expand docs/examples after tests lock command behavior.

## Exit Criteria

- CLI commands are thin over the shared app/capability layer.
- Internal source ids and route-only ids are isolated from public contracts.
- Success and failure output are always parseable JSON and covered by subprocess tests.
- Fixture-backed tests cover the known KASB identifier mismatch and Q&A endpoint behavior.
