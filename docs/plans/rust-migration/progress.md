# Rust migration execution progress

Current gate: phases 1–2 implemented and independently reviewed locally; final
validation and PR delivery pending.

| Phase | Exit evidence | State |
| --- | --- | --- |
| 1. Freeze compatibility evidence | multi-language docs; 12-case serialized TypeScript baseline; 3 path-pinned known-bad controls rejected; counts in `parity.md` | reviewed locally |
| 2. Translation rulebook | complete v1 request/result/failure/fixture/cancellation inventory and resolved pilot mappings in `rulebook.md` | reviewed locally |
| 3. Workspace layout | independent npm and Cargo builds/tests with shared root evidence | not started |
| 4. Rust `get-paragraph` pilot | complete `wreq` path and success/failure/timeout/cancellation conformance | not started |

## Durable decisions

- The existing Node.js CLI remains the sole CLI.
- The SDKs share specs, fixtures, and serialized cases, not runtime code or FFI.
- Only `metadata.fetchedAt` is canonicalized by the parity judge.
- Phase 5 remaining Rust capabilities is outside the active goal.

## Validation

- `bun test test/conformance/conformance.test.ts`: 18 passing tests, including
  the JSON-serialization regression, 12 TypeScript baseline cases, and 3
  path-pinned negative controls.
- `bun test`: 177 passing tests and 1 opt-in live test skipped after PR review
  fixes.
- `bun run typecheck`, `bun run build`, and `git diff --check`: passing after
  review fixes.

## Next action

Run the complete repository validation and required implementation review,
deliver phases 1–2 through their PR lifecycle, then begin phase 3 only after the
PR is merged.
