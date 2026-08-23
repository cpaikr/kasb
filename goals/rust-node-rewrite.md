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

- On 2026-08-23, the user approved all three recommended Phase 4
  compatibility policies:
  - contained native panics emit only the sanitized
    `sjunepark.kasb.native` diagnostics-channel event
    `{ "code": "binding_panic" }`, without panic details or unsolicited
    stderr;
  - Windows preserves the launcher process contract except that exact POSIX
    signal identity is not promised because Node exposes forceful termination
    semantics there; and
  - Linux GNU x64 and ARM64 native packages require glibc 2.28, enforced for
    both the Node addon and same-revision Rust CLI artifact before support is
    promoted.

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

Commit and open the completed Phase 4 candidate, run the full native CI matrix,
promote support only from passing evidence, and complete the Phase 4 PR
lifecycle. Only afterward begin the dependent canonical cutover.

### Evidence and blockers

- The user resumed the blocked goal on 2026-08-23 by approving all three Phase
  4 compatibility recommendations. Implementation and validation may proceed;
  publication, release tags, version selection, and external KASB mutation
  remain unauthorized.

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
- No independent implementation blocker is currently known. The contained
  panic observability channel, Windows console-signal support statement, and
  Linux GNU glibc floor are approved and being implemented. Registry
  publication, version selection, release tags, and external KASB mutation
  remain unauthorized.
- Phase 4 now has an implemented six-operation asynchronous Node-API candidate,
  root Node facade, frozen network-free toolset projection, generated four-target
  native package matrix, shell-free launcher, Node public-surface judge, and
  same-revision macOS ARM64 packed-consumer evidence. Support remains explicitly
  unclaimed until the full native CI matrix passes.
- Repository-required Phase 4 review corrections now pass independent
  verification for binding safety, facade sanitization and class identity,
  immutable artifact allowlists, extracted direct-archive execution,
  per-target process evidence, action pinning, and documentation freshness.
  Exact napi 3.12.2 includes the upstream AbortSignal memory-safety fix.
- The post-policy repository-required review clean loop found and fixed four
  safe gate gaps: cancellation-field coverage, sanitized resolver failures for
  corrupted target metadata, parsed per-job native-workflow validation, and a
  native Windows `CTRL_BREAK_EVENT` termination probe. Independent binding,
  launcher, and native-CI reviewers report no remaining Bucket I or Bucket II
  findings. Windows execution remains correctly unclaimed until native CI.
- Current local evidence passes contract/declaration/native metadata freshness,
  123 adversarial/conformance tests, nine Node package tests and typecheck,
  including the real-Node cancellation and sanitized panic-diagnostic paths,
  macOS ARM64 packed native and extracted direct-archive consumers on Node 24,
  Rust 1.88, formatting and strict clippy, license and diff hygiene, the full
  deterministic suite, and the 208-test opt-in live suite. The four-target,
  seven-version CI matrix remains unrun and support remains `planned`.
- Current Node documentation establishes that Windows does not have POSIX
  signal semantics and Node emulates child termination; the approved launcher
  contract therefore excludes exact signal identity there. The approved glibc
  2.28 floor is now encoded in the native manifest, digest-pinned Linux build
  containers, generated package docs, symbol-floor validator, and clean
  consumer workflow. Linux support remains unclaimed until that CI evidence
  passes.
