# Goal: Rust migration foundation and get-paragraph pilot

Status: active
Planning scope: ROADMAP.md

## Original contract

Goal contract
- Outcome: Deliver the independently buildable TypeScript/Rust workspace and a validated, contract-compatible Rust `get-paragraph` vertical pilot using `wreq`.
- Goal state: `goals/rust-migration-foundation-pilot.md`
- Included results and sources (semantic results define scope; paths supply detail):
  - Multi-language product and command alignment — `MIGRATION.md`, `VISION.md`, `ARCHITECTURE.md`, `README.md`
  - Validated language-neutral parity judge and known-bad detection — `MIGRATION.md`, `docs/specs/kasb-standards-v1.md`, `fixtures/`, `test/`
  - Durable Rust translation rulebook and pilot evidence — `MIGRATION.md`, `docs/research/kasb-standard-source-map.md`
  - Independently buildable dual-package workspace with shared evidence — `MIGRATION.md`, `package.json`
  - Complete Rust `get-paragraph` path with pinned `wreq`, persona client, validation, typed failures, normalization, cancellation, and conformance — `MIGRATION.md`, `docs/specs/kasb-standards-v1.md`, `src/app/get-paragraph.ts`, `src/sources/kasb/`
- Complete when: Every included result achieves its cited outcome and migration phases 1–4 exit gates; repository-required validation and review pass; planning is truthful; Delivery finishes.
- Excluded: Migration phase 5—remaining Rust capabilities beyond `get-paragraph`.
- Authority: Execute only included results and necessary supporting work; record anything else and ask before scope expansion or external authority.
- Resume: Initialize this contract with $progress goal mode before work; recover it before every resume, continuation, compaction, or handoff; stop if recovery fails.
- Delivery: PR delivery — use $progress's PR lifecycle and the fewest sequential reviewable PRs; finish each through $create-pr and $address-pr-feedback before starting the next, including the final implementation slice.

## Authorized amendments

_None._

## Execution status

### Completed included results

- Migration phase 1: multi-language product/command alignment and the validated
  serialized, language-neutral parity judge with known-bad detection.
- Migration phase 2: the complete v1 translation inventory and resolved Rust
  pilot rulebook.

### Current in-scope result

Migration phase 3: independently buildable TypeScript/Rust workspace with
shared root evidence.

### Next in-scope action

Move the existing TypeScript package without behavior or export drift, scaffold
the Rust workspace/crate, and prove both package roots build and test
independently before implementing the pilot.

### Evidence and blockers

- The execution base includes commit `6ee3842`, which strengthens the approved phase 1–4 gates in `MIGRATION.md` and is intentionally retained.
- PR delivery uses `codex/rust-migration-pilot-integration` as the non-production integration branch so goal metadata can be committed directly while implementation remains reviewable.
- Multi-language docs, 12 serialized TypeScript baselines, three path-pinned
  known-bad controls, and the complete v1 translation inventory are implemented
  locally. Independent review and PR findings were applied; the latest complete
  validation passes with 178 tests and one opt-in live test skipped.
- Foundation [PR #12](https://github.com/sjunepark/kasb/pull/12) merged as
  `ecf8da5` after all seven review threads were resolved. Its final validation
  passed 178 tests with one opt-in live test skipped, typecheck, build, and
  diff checks.
- Migration phase 5 and later release/performance work remain outside this goal.
