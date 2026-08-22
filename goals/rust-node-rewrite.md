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

_None._

### Current in-scope result

Phase 1: freeze the compatibility baseline, establish the OpenAPI wire
authority, strengthen the adversarial public-surface judge, and prove Node-API
and native-launcher feasibility.

### Next in-scope action

Inventory the existing public surfaces and validation baseline, then implement
the phase-1 authorities, judge, and disposable feasibility slices on a review
branch from the integration base.

### Evidence and blockers

- Boundary check: phase 1 is included directly by the first named result and
  is the prerequisite for the remaining implementation phases.
- PR delivery uses `codex/rust-node-rewrite-integration` as the non-production
  integration branch so goal metadata can be committed directly while
  implementation remains reviewable.
- `main` starts one local planning commit (`31ef0ec`) ahead of `origin/main`;
  that approved rewrite plan is retained as the integration base.
- No blocker is currently known. Registry publication, version selection,
  release tags, and external KASB mutation remain unauthorized.
