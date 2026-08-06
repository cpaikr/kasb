# Rust migration execution progress

Current gate: phases 1–4 complete and validated. The integration branch is
ready for final promotion to `main`.

| Phase | Exit evidence | State |
| --- | --- | --- |
| 1. Freeze compatibility evidence | multi-language docs; 12-case serialized TypeScript baseline; 3 path-pinned known-bad controls rejected; counts in `parity.md` | delivered in PR #12 |
| 2. Translation rulebook | complete v1 request/result/failure/fixture/cancellation inventory and resolved pilot mappings in `rulebook.md` | delivered in PR #12 |
| 3. Workspace layout | independent npm and Cargo builds/tests with shared root evidence | completed at the phase-3 commit gate |
| 4. Rust `get-paragraph` pilot | complete `wreq` path and success/failure/timeout/cancellation conformance | delivered in PR #13 after feedback resolution |

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
- Phase 4 Rust suite: 14 unit tests and 12 integration tests pass. Evidence
  includes four captured paragraph forms, both shared serialized paragraph
  cases, exact invalid/not-found/source-drift failures, HTTP retryability,
  zero retry, timeout, primary/enrichment cancellation, enrichment warnings,
  URL encoding, narrow HTML normalization, and a local `wreq` exchange proving
  API headers plus in-memory cookie reuse.
- Independent review found and verified fixes for typed-request validation
  bypass, `wreq`'s default automatic retry policy, empty parent identifiers,
  Unicode digit normalization, and ECMAScript whitespace trimming. The actual
  persona replay test passed five repeated runs with exactly one connection.
- PR #13 review feedback was applied and merged: completion-time metadata,
  camelCase recovery hints, content trimming, status-first error handling,
  exact-paragraph schema parity, surrogate rejection, dependency floors, and
  consumer setup documentation now match their contracts. Broader suggestions
  on unchanged TypeScript capabilities remain outside this phase-4 pilot.
- `cargo clippy --workspace --all-targets --locked -- -D warnings` passes.
- `cargo +1.88.0 test --workspace --locked` passes all 26 Rust tests, validating
  the corrected minimum toolchain after an exact 1.85 run exposed upstream
  `typed-builder-macro` syntax incompatibility.
- `cargo +1.88.0 package --locked --allow-dirty` builds and verifies the
  packaged Rust crate from its package root.

## Next action

Promote this completed phases 1–4 integration state to `main`. Any phase 5 work
requires a separate authorized goal.
