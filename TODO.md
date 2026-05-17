# TODO

Ordered near-term queue. Keep details for the active item in [PLAN.md](PLAN.md).

## Done In Current Scaffold

- Added Bun/TypeScript package files and real scripts.
- Created `src`, `fixtures`, `test`, `evals`, and build script roots.
- Implemented Darty-style app, capability, CLI, and KASB source adapter layers.
- Captured fixtures for standards search, structure lookup, section retrieval, paragraph retrieval, Q&A search, and Q&A detail retrieval.
- Added fixture-backed provider tests, CLI subprocess tests, and gated live checks.

## Next Up

1. Broaden contract tests.
   - Assert JSON Schema exports for each operation.
   - Add request validation edge cases for every command.
2. Harden source normalization.
   - Add drift tests for missing KASB fields.
   - Add more Q&A type examples.
3. Improve CLI smoke coverage.
   - Add success-path subprocess checks with mocked or fixture-backed fetch where practical.
   - Add bundled CLI entrypoint tests.
4. Add docs after behavior settles.
   - CLI examples for each command.
   - Q&A capability spec refinements if source type names are promoted.

## Later

- Add capability-scoped evals after the CLI behavior stabilizes.
- Consider user-facing route URLs only if they can be derived safely.
