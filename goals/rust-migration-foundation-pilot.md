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
- Migration phase 3: the independently buildable TypeScript/Rust workspace with
  shared root fixtures, conformance cases, evals, and documentation.

### Current in-scope result

Migration phase 4 delivery: contract-compatible Rust `get-paragraph` vertical
pilot implementation, local exit gate, and independent review are complete;
the PR lifecycle remains.

### Next in-scope action

Deliver the implementation PR through feedback resolution, then finish the
integration-to-main promotion PR.

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
- Phase 3 passes root aggregate, package-local TypeScript, and crate-local Cargo
  build/test gates, and independent review found no remaining implementation
  blocker after three findings were corrected. The TypeScript package still
  passes 178 tests with one opt-in live skip from the root and 170 tests with
  one skip package-locally; its packed exports and built Node CLI smoke tests
  remain green.
- Phase 4 now implements the public Rust request/result types, exact validation,
  typed failures, injected clock and async transport, pinned `wreq` persona,
  KASB URL/source normalization, best-effort enrichment, and distinct
  cancellation. Thirteen unit tests and eleven integration tests pass, including
  the two shared serialized paragraph cases and a local persona header/cookie
  exchange; clippy passes with warnings denied. The full suite also passes on
  the corrected Rust 1.88 minimum after exact 1.85 validation exposed an
  upstream transitive syntax incompatibility.
- Independent phase-4 review has no remaining actionable blocker after fixes
  for request-construction validation, automatic transport retries, empty
  parent identifiers, Unicode-digit normalization, and ECMAScript trimming.
  Root validation and packaged-crate verification pass after those fixes.
- Migration phase 5 and later release/performance work remain outside this goal.
