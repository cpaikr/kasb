# TODO

Ordered near-term queue. Keep details for the active item in [PLAN.md](PLAN.md).

## Done In Current Scaffold

- Added Bun/TypeScript package files and real scripts.
- Created `src`, `fixtures`, `test`, `evals`, and build script roots.
- Implemented Darty-style app, capability, CLI, and KASB source adapter layers.
- Captured fixtures for standards search, structure lookup, section retrieval, paragraph retrieval, Q&A search, and Q&A detail retrieval.
- Added fixture-backed provider tests, CLI subprocess tests, and gated live checks.

## Next Up

1. Finish the current hardening pass.
   - Keep JSON Schema export, request validation, source drift, and CLI entrypoint coverage aligned with the implemented commands.
   - Avoid documenting command details until review fixes settle.
2. Harden source normalization.
   - Add focused drift tests for malformed or missing KASB fields when new source assumptions are discovered.
   - Add more Q&A type examples only if they clarify stable behavior.
3. Add user-facing docs after behavior settles.
   - CLI examples for each command.
   - Q&A capability spec refinements if source type names are promoted.

## Later

- Add capability-scoped evals after the CLI behavior stabilizes.
- Consider user-facing route URLs only if they can be derived safely.
