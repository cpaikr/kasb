# Rust migration execution progress

Current gate: phases 1–3 delivered; phase 4 Rust `get-paragraph` pilot in progress.

| Phase | Exit evidence | State |
| --- | --- | --- |
| 1. Freeze compatibility evidence | multi-language docs; 12-case serialized TypeScript baseline; 3 path-pinned known-bad controls rejected; counts in `parity.md` | delivered in PR #12 |
| 2. Translation rulebook | complete v1 request/result/failure/fixture/cancellation inventory and resolved pilot mappings in `rulebook.md` | delivered in PR #12 |
| 3. Workspace layout | independent npm and Cargo builds/tests with shared root evidence | completed at the phase-3 commit gate |
| 4. Rust `get-paragraph` pilot | complete `wreq` path and success/failure/timeout/cancellation conformance | not started |

## Durable decisions

- The existing Node.js CLI remains the sole CLI.
- The SDKs share specs, fixtures, and serialized cases, not runtime code or FFI.
- Only `metadata.fetchedAt` is canonicalized by the parity judge.
- Phase 5 remaining Rust capabilities is outside the active goal.

## Validation

- `bun test packages/kasb-ts/test/conformance/conformance.test.ts`: 18 passing tests, including
  the JSON-serialization regression, 12 TypeScript baseline cases, and 3
  path-pinned negative controls.
- `bun test`: 178 passing tests and 1 opt-in live test skipped after PR review
  fixes.
- `bun run typecheck`, `bun run build`, and `git diff --check`: passing after
  review fixes.
- Phase 3 root aggregate: `bun run typecheck`, `bun run test`, and
  `bun run build` pass; the aggregate test gate retains 178 TypeScript passes,
  one opt-in live skip, and the Cargo scaffold tests.
- Phase 3 package roots: `bun run typecheck && bun test && bun run build` plus
  the built Node CLI smoke pass from `packages/kasb-ts`; `cargo build --locked`
  and `cargo test --locked` pass from `crates/kasb`.

## Next action

Implement the native Rust `get-paragraph` path with the pinned `wreq` persona
client, typed validation/failures, normalization, cancellation, and shared
serialized conformance evidence.
