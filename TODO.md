# TODO

Ordered near-term queue. Keep details for the active item in [PLAN.md](PLAN.md).

## Next Up

1. Scaffold the Darty-shaped Bun/TypeScript CLI project.
   - Add the real package files.
   - Create `src`, `fixtures`, `test`, and `evals` roots.
2. Create the source skeleton.
   - Add the Darty-style layer roots needed for app composition, capabilities, CLI, and KASB source access.
   - Start with one capability path, then repeat the pattern once code proves it.
3. Capture v1 KASB fixtures.
   - `/api/standard?searchWord=리스`
   - `/api/standard-indexes/1116`
   - `/api/paragraphs/1116/ZB2hJW`
   - `/api/paragraphs/content/1116/23`
   - include appendix-style paragraph examples from the source map.
4. Implement the shared capability contracts.
   - Effect Schema request/result contracts.
   - JSON Schema exports.
   - request resolution and typed failures.
   - keep every CLI output mode as JSON.
5. Implement source adapters and core execution.
   - Normalize KASB API payloads into capability envelopes.
   - Test `titleDocumentId` versus `indexDocumentId` behavior explicitly.
6. Add the CLI transport.
   - Commander root command.
   - Four v1 operation commands.
   - JSON success output on `stdout`.
   - JSON failure output on `stderr` with nonzero exit code and empty `stdout`.
   - CLI smoke tests for both success and failure paths.

## Later

- Add opt-in live checks gated by `LIVE_KASB_TESTS=1`.
- Add capability-scoped evals after the CLI works.
