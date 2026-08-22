# Goal: Complete the KASB Rust/Node rewrite and cutover

Status: active
Planning scope: ROADMAP.md

## Original contract

Goal contract

Outcome: Complete the full KASB rewrite and cutover to one public Rust SDK powering a first-class Rust clap CLI and a Rust-backed Node SDK. Preserve npm installation of `kasb` through a transparent launcher for the packaged Rust CLI binary. Remove the TypeScript conformer, JavaScript CLI implementation, and Pi adapter after all cutover gates pass.

Goal state: goals/rust-node-rewrite.md

Included results and sources:

- Freeze the compatibility baseline, establish the KASB OpenAPI wire authority, and strengthen the adversarial public-surface judge — plans/rust-node-rewrite.md, docs/specs/kasb-standards-v1.md, conformance/, fixtures/
- Complete all six public operations in the Rust SDK as the sole KASB conformer — crates/kasb, ARCHITECTURE.md, docs/research/kasb-standard-source-map.md
- Build a first-class Rust clap CLI over the public Rust SDK, preserving approved commands, machine envelopes, diagnostics, and exit behavior — crates/kasb-cli, docs/specs/kasb-standards-v1.md
- Build the asynchronous Node-API projection and thin Node SDK/toolset — crates/kasb-node, packages/node, ARCHITECTURE.md
- Package exact-version platform artifacts for Linux GNU x64/ARM64, macOS ARM64, and Windows x64; each target package contains the Node addon and same-revision Rust CLI binary — packages/native, plans/rust-node-rewrite.md
- Keep npm `kasb` as a shell-free platform resolver and transparent process launcher; do not download, compile, parse commands, render output, or provide a JavaScript fallback — packages/node, docs/tools/transport-decision.md
- Cut over only after independent SDK, CLI, Node, native-target, packed-consumer, live, and adversarial validation passes; then remove the TypeScript implementation and Pi surface — plans/rust-node-rewrite.md, MIGRATION.md

Complete when:

- Every exit gate and completion criterion in plans/rust-node-rewrite.md passes.
- The Rust SDK solely owns KASB transport, decoding, normalization, domain policy, and capability failures.
- Direct and npm-launched Rust CLI behavior is equivalent.
- The Node SDK delegates through the asynchronous Node-API binding.
- Every claimed target passes native build and clean packed-consumer tests.
- No TypeScript KASB conformer, JavaScript CLI behavior, or Pi surface remains.
- Planning and current documentation are reconciled.
- Required review and validation pass.

Excluded:

- New KASB capabilities beyond the approved v1 contract.
- Pi, MCP, or another host adapter.
- Runtime native downloads, install-time compilation, or JavaScript CLI fallback.
- Browser or edge runtime support, database ingestion, mutation, login, or multi-provider abstraction.
- Registry publication, version selection, release tags, or external KASB mutation.

Authority: Execute only the included rewrite and necessary supporting work. Preserve the existing implementation until replacement gates pass. Record materially different product or compatibility decisions and ask before expanding scope or performing external publication.

Resume: Initialize and maintain this contract using $progress goal mode. Recover the goal state before every continuation, compaction, or handoff; stop if recovery fails.

Delivery: Use the fewest sequential reviewable PRs practical. Run the repository-required code review after each reviewable slice and complete the PR review lifecycle before beginning a dependent slice.

## Authorized amendments

_None._

## Execution status

### Completed included results

- Phase 1: the compatibility baseline, sole OpenAPI wire authority and
  language-neutral source profile, fixture/contract/declaration freshness
  checks, process-isolated adversarial judge, and private Node-API/native
  launcher feasibility proof are integrated by PR #15.
- Phase 2: all six approved public operations, shared bounded transport,
  decoding, normalization, domain policy, typed failures, cancellation, and
  malformed-source controls are integrated in the public Rust SDK by PR #16.
- Phase 3: the first-class Rust `clap` CLI, all six commands, frozen machine
  behavior, and independent native-process judge are integrated by PR #17.

### Current in-scope result

Phase 4: build the complete asynchronous Node-API projection, thin Node
SDK/toolset, exact-version native packages, and transparent npm Rust CLI
launcher while preserving the TypeScript product until every replacement and
packed-consumer gate passes.

### Next in-scope action

Create the Phase 4 branch from the integration tip, reconcile the feasibility
proof and `../ytm` distribution pattern against the frozen Node/package
surface, then implement and validate the complete Rust-backed Node product and
claimed native package matrix as the next reviewable PR.

### Evidence and blockers

- Boundary check: phase 1 is included directly by the first named result and
  is the prerequisite for the remaining implementation phases.
- PR delivery uses `codex/rust-node-rewrite-integration` as the non-production
  integration branch so goal metadata can be committed directly while
  implementation remains reviewable.
- `main` starts one local planning commit (`31ef0ec`) ahead of `origin/main`;
  that approved rewrite plan is retained as the integration base.
- The frozen compatibility inventory, OpenAPI wire authority and source
  profile, fixture/contract/declaration freshness checks, process-isolated
  adversarial judge, and private Node-API/native-launcher feasibility proof are
  implemented on the phase-1 branch.
- PR #15 merged into `codex/rust-node-rewrite-integration` as merge commit
  `2c7892d`, preserving the two reviewed commits. All 20 review threads received
  verified dispositions and were resolved; refreshed GitGuardian and
  CodeRabbit checks passed or skipped under the repository incremental-review
  policy with no new thread.
- PR #16 merged into `codex/rust-node-rewrite-integration` as merge commit
  `79876bc`, preserving the two reviewed commits. All 14 review threads received
  verified dispositions and were resolved; refreshed GitGuardian and
  CodeRabbit checks passed or skipped under the repository incremental-review
  policy with no new thread.
- Full deterministic validation after the Phase 2 feedback fixes passes:
  frozen install, contract and declaration checks, 56 adversarial/conformance
  tests, macOS ARM64 native feasibility, typecheck, 215 Bun tests with one live
  test skipped, the full current Rust suite, build, formatting, clippy with
  warnings denied, Rust 1.88 workspace check, and diff hygiene.
- The opt-in live suite passes 208 tests, including the bounded KASB traversal.
- Independent repository-required review of the Phase 2 feedback cluster
  reports no remaining Bucket I or Bucket II findings and gives an explicit
  PASS verdict.
- Native feasibility is evidenced only for macOS ARM64. Linux GNU x64/ARM64
  and Windows x64 remain planned and unclaimed until their later native gates.
- The TypeScript conformer, JavaScript CLI, and Pi adapter remain intentionally
  present until the replacement SDK, CLI, Node, native-target, and packed
  consumer gates pass.
- PR #17 merged into `codex/rust-node-rewrite-integration` as merge commit
  `691506e`, preserving the two reviewed commits. All seven review threads
  received verified dispositions, CodeRabbit acknowledged every fix, and the
  refreshed CodeRabbit and GitGuardian checks passed. Codex reported no major
  issue.
- Full deterministic validation after the Phase 3 feedback fixes passes:
  frozen install, contract and declaration checks, 100 adversarial/conformance
  tests including 44 CLI process cases, macOS ARM64 native feasibility,
  typecheck, 215 Bun tests with one live test skipped, workspace Rust tests and
  build, release-binary smoke checks, formatting, clippy with warnings denied,
  Rust 1.88 workspace check, and diff hygiene. The opt-in live suite passes 208
  tests, and independent repository-required review reports no Bucket I or II
  finding with an explicit PASS.
- No blocker is currently known. Registry publication, version selection,
  release tags, and external KASB mutation remain unauthorized.
