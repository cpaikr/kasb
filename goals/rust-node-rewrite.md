# Goal: Complete the KASB Rust/Node rewrite and cutover

Status: complete
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
- On 2026-08-23, the user approved the delivery and maintenance amendment:
  - transfer the still-private repository to `cpaikr/kasb`, preserve PR #19,
    update repository metadata and the local remote, and close obsolete Release
    Please PR #11;
  - retain npm identities under `@sjunepark/*`; and
  - retain macOS ARM64 and Windows x64 as supported packages but deliberately
    omit them from continuous CI to reduce compute cost. Continuous native CI
    now covers Linux GNU x64/ARM64 on Blacksmith, and the workflow records the
    accepted omission. The earlier four-target evidence remains the support
    basis for the two non-continuous targets.

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
- Phase 4: the asynchronous six-operation Node-API projection, thin Node
  SDK/toolset, shell-free npm Rust CLI launcher, supported four-target native
  packages, and same-revision direct CLI artifacts are integrated by PR #18.

### Current in-scope result

The full rewrite and cutover are complete. `packages/node` is the canonical npm
product, neutral contracts and tests live with that facade, the TypeScript
conformer, JavaScript CLI behavior, and Pi surface are removed, and publication
automation is disabled. Final-revision Linux GNU x64/ARM64 Blacksmith CI and the
Phase 5 PR lifecycle passed; macOS ARM64 and Windows x64 remain supported but
are not continuously tested by explicit user decision.

### Next in-scope action

None. Promotion to `main`, registry publication, version selection, release
tags, and external KASB mutation remain outside this completed goal and require
separate authorization.

### Evidence and execution history

- Phase 5 now promotes `packages/node` to `@sjunepark/kasb`, moves only the
  neutral toolset/contract/schema surface into it, adds independent Rust SDK
  conformance coverage, and runs deterministic eval orchestration through
  caller-owned fixture operations rather than a second conformer. Root build,
  test, typecheck, conformance, live, and native preparation paths no longer
  depend on `packages/kasb-ts`.
- The TypeScript transport/source/capability implementation, JavaScript CLI
  implementation, Pi export/registration/tests, and obsolete Release Please
  and tag-publish workflows are deleted. The npm JavaScript entrypoint that
  remains is only the approved shell-free platform resolver and process
  launcher.
- The final cutover tree passes frozen installation; contract, declaration,
  native metadata/workflow/glibc, and license checks; Node/eval typechecking;
  63 deterministic Node tests with one live skip; eight eval tests whose six
  operation outputs are checked against their advertised schemas; the complete
  Rust workspace test/build suite; formatting; strict clippy; Rust 1.88; the
  93-case adversarial public-surface judge; macOS ARM64 production native and
  clean packed-consumer feasibility on Node 24; the bounded live traversal;
  diff hygiene; and a 50-run cancellation-start stress regression.
- Independent binding, launcher/package, and native-CI review reports no
  remaining Bucket I or Bucket II finding. Review corrections enforce public
  identity and Pi absence on extracted root artifacts, schema-valid eval
  fixtures, the aggregate artifact-validator workflow step, and a judge-only
  transport-start handshake that cannot compile into a release addon.
- The reviewed Phase 5 cutover is committed as `7f74506` and opened as PR #19
  against `codex/rust-node-rewrite-integration`. CodeRabbit and GitGuardian
  report success. Actions run `32625886321` executed zero workflow steps:
  GitHub annotated both entry jobs with “The job was not started because an
  Actions budget is preventing further use,” so the dependent four-target and
  aggregate jobs were skipped. This external capacity event is not product
  evidence; the current-revision native CI and PR merge gates remain open.
- The repository transfer to private `cpaikr/kasb` completed without changing
  npm scope or losing PR #19. Obsolete Release Please PR #11 is closed and the
  local `origin` follows the organization repository. The CI amendment replaces
  GitHub-hosted Linux runners with Blacksmith and makes Linux GNU x64/ARM64 the
  explicit continuous subset; supported macOS ARM64 and Windows x64 artifacts
  remain outside ongoing CI under the authorized compute-cost exception.
- The transfer/CI amendment passes frozen installation; contract, declaration,
  native metadata/workflow, glibc, license, typecheck, test, build, formatting,
  strict clippy, Rust 1.88, 93-case adversarial judge, host-native feasibility,
  bounded live, YAML, and diff-hygiene validation. Independent CI and
  documentation review reports no Bucket I or Bucket II finding; the actual
  Linux Blacksmith run remains the product-evidence gate.
- Blacksmith run `32640118370` confirmed the organization integration, passed
  the immutable root package, and started both native Linux architectures. Its
  deterministic job exposed a clean-checkout dependency: declaration consumers
  were compiled before `packages/node/dist` existed. `contracts:check` now
  self-prepares through the package-owned Node build; a cold-output reproduction,
  targeted validation, and independent review pass before the required rerun.
- Blacksmith run `32640681413` passed the corrected final revision: deterministic
  validation, immutable root packaging, Linux GNU x64 and ARM64 native builds,
  glibc 2.28 enforcement, Node 20.18.1 through 26 clean packed consumers,
  direct CLI archives, and the aggregate continuous-CI artifact validator all
  succeeded. PR #19 had no unresolved review threads, remained CodeRabbit-green,
  and merged into `codex/rust-node-rewrite-integration` as merge commit
  `133c153`, preserving all four Phase 5 commits. No publication, version
  selection, release tag, default-branch promotion, or external KASB mutation
  occurred.

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
- The first full native run, Actions run `32616678745`, exercised all four
  target jobs far enough to identify four merge-gate portability defects:
  cargo-about was installed without its required CLI feature, Windows text
  checkout made the generated-metadata freshness comparison line-ending
  dependent, native consumers inspected the runner's unbuilt source directory
  instead of the downloaded root tarball, and both pinned manylinux containers
  lacked libclang for dependency binding generation. The local correction
  makes text comparison CRLF-invariant, inspects the exact immutable tarballs,
  installs cargo-about with `cli`, and installs `clang-devel`; native metadata,
  license, macOS ARM64 packed-consumer, and diff-hygiene checks pass locally.
  No target support claim has been promoted pending a clean full rerun.
- Independent repository-required review of those portability corrections
  reports no Bucket I or Bucket II findings. The reviewers verified the
  fail-closed immutable-tarball allowlists, direct/npm equivalence ordering,
  CRLF-only freshness normalization, and workflow prerequisite enforcement;
  the remaining evidence requirement is the clean four-target CI rerun.
- The second full native run, Actions run `32617272525`, passes the complete
  macOS ARM64, Linux GNU x64, and Linux GNU ARM64 build, artifact, ABI-floor,
  seven-version Node, direct-archive, and packed-consumer matrices. It exposed
  two remaining gate defects: clean checkout typecheck ran before the Node
  package generated its consumer-facing `dist` declarations, and the Windows
  console-break probe targeted npm's generated `.cmd` shell shim, whose exit
  does not prove descendant termination. The local correction makes Node
  package typecheck self-preparing and targets the installed JavaScript
  launcher for the Windows forwarding probe while retaining ordinary `.cmd`
  invocation coverage. Node typecheck, native metadata, licenses, macOS ARM64
  packed consumer, and diff hygiene pass locally. Independent review found and
  closed one detached-tree cleanup path for Windows probe failures, then
  reported no remaining Bucket I or Bucket II findings. Windows and the full
  matrix remain unclaimed pending the clean rerun.
- Independent repository-required review passes both run `32619558167`
  corrections with no Bucket I or Bucket II findings. Review confirms the
  pinned Rust components satisfy the exact later gates and that canonicalizing
  both existing working-directory paths preserves effective directory identity
  without weakening the exact direct/npm process comparison.
- The third full native run, Actions run `32618511924`, passes the immutable
  root package and complete macOS ARM64, Linux GNU x64, and Linux GNU ARM64
  matrices. It confirms the clean-checkout Node typecheck fix. Two later gates
  exposed clean-environment assumptions: the deterministic Bun suite started
  twenty 30-second Rust conformance cases before cold-building their shared
  example, and the headless Windows runner had no console for the native
  `AttachConsole` sender. The local correction prebuilds the shared Rust
  conformance example once, removes the unsafe console sender, exercises the
  approved Windows forceful-termination contract directly, and triggers the
  installed launcher's real Node `SIGBREAK` handler after its native child is
  ready. The full 215-test deterministic TypeScript/eval suite, 13 Node tests,
  Node typecheck, contract/native checks, macOS ARM64 packed consumer, Rust
  formatting and strict binding clippy, and diff hygiene pass locally.
- Initial Codex PR review found that a host below glibc 2.28 could select an
  incompatible GNU package. The current feedback fix preserves Node's reported
  glibc version, rejects missing, malformed, and below-floor versions before
  addon or CLI resolution, emits an actionable sanitized diagnostic only for
  an otherwise supported target family, and retains the generic unsupported
  platform diagnostic for unsupported architectures. Real-Node addon and
  launcher boundary tests cover glibc 2.27, exact 2.28 acceptance, and
  unsupported-architecture precedence. The fix was pushed in `db4de8e`, the
  review thread received its commit-and-validation reply, and the thread is
  resolved.
- Independent repository-required review now passes the complete correction
  cluster with no Bucket I or Bucket II findings. The final Windows review
  correction treats any non-successful termination as valid instead of
  requiring a null signal field, preserving forceful Windows termination
  without promising POSIX signal identity. The remaining evidence gate is a
  clean full native matrix at the pushed revision.
- The fourth full native run, Actions run `32619558167`, passes the immutable
  root package, the cold typecheck and 215-test deterministic suite, the
  123-case adversarial judge, all three Unix native target matrices, and every
  Linux glibc floor and Node 20.18.1 through 26 consumer. It exposed two final
  clean-runner prerequisites after reaching previously unopened gates: the
  minimal Rust 1.88 deterministic install omitted `rustfmt` and `clippy`, and
  Windows can report the inherited working directory through its equivalent
  8.3 short-path alias. The current correction explicitly installs both Rust
  components and compares real paths on both sides while retaining exact
  direct/npm launcher equivalence. Windows target support and the aggregate
  matrix remain unclaimed pending the clean rerun.
- The fifth full native run, Actions run `32620270180`, confirms the pinned
  Rust components and Windows path correction while passing deterministic
  validation, the immutable root package, and the complete Windows x64, macOS
  ARM64, and Linux GNU x64 matrices. Its Linux GNU ARM64 Node 20.18.1 consumer
  passed addon loading and ordinary direct/npm process equivalence, then timed
  out in the npm launcher's POSIX
  termination probe. The launcher spawned the native child before installing
  forwarding handlers, so a child that announced readiness immediately could
  expose a window in which SIGTERM killed only the launcher and stranded the
  native child holding inherited pipes. The local correction installs handlers
  before spawn and makes both signal probes issue one termination request with
  phase-specific timeout diagnostics. Independent review confirmed the
  production correction and found that failure-path probe cleanup could still
  strand the same native descendant. The current harness therefore creates a
  dedicated POSIX process group and kills that group on every rejection; a
  deliberately broken-launcher regression proves bounded failure and descendant
  cleanup. Independent re-review reports no remaining Bucket I or Bucket II
  finding. macOS ARM64 native feasibility, all 13 Node tests, Node typechecking,
  contract and native metadata checks, Rust formatting, syntax checks, and diff
  hygiene pass locally. Support remains unclaimed pending a fully clean rerun.
- The sixth full native run, Actions run `32621109003`, passes deterministic
  validation and all four complete native target jobs, including both Linux
  glibc floors, all Node 20.18.1 through 26 packed consumers, direct CLI
  archives, and the repaired Linux ARM64 signal path. The final aggregate job
  downloaded every immutable artifact and found that Windows checkout had
  converted the packaged license to CRLF while the Linux checkout authority
  remained LF; byte inspection shows exactly 55 CRLF substitutions in both the
  Windows npm package and direct CLI archive and no content difference. The
  current correction adds a repository checkout invariant keeping all tracked
  text LF across artifact-producing operating systems. Independent review
  reports no Bucket I or Bucket II finding and confirms generated native
  binaries remain outside the tracked-text rule. Support remains unclaimed
  pending a clean aggregate rerun from the corrected revision.
- The seventh full native run, Actions run `32622016449`, passes deterministic
  validation, the immutable root package, and all four complete native target
  jobs, including both Linux glibc floors, every Node 20.18.1 through 26 packed
  consumer, direct CLI archives, process equivalence, and target artifact
  uploads. GitHub did not start the dependent aggregate job because the
  repository account's Actions budget was exhausted; it executed no steps and
  reported no validator failure. The exact nine immutable artifacts from that
  revision were downloaded and passed the repository's unchanged
  `scripts/validate-release-artifacts.mjs` aggregate validator locally. This
  closes the artifact-content gate without treating the external budget event
  as product evidence, and the four listed native targets are now supported.
- Independent repository-required review reproduced the exact nine-artifact
  download and unchanged aggregate validation, confirmed `supportClaim` is
  metadata-only at runtime, and found no Bucket I or Bucket II issue in the
  support promotion or current-versus-cutover documentation boundary.
- PR #18 merged into `codex/rust-node-rewrite-integration` as merge commit
  `e3b06ed`, preserving all eight reviewed commits. Its only final failing CI
  statuses executed zero steps and carry GitHub's explicit Actions-budget
  annotation; the exact preceding full-matrix artifacts and local promotion
  checks provide the recorded product evidence. All review threads are
  resolved, CodeRabbit passed or skipped under the repository label policy,
  GitGuardian passed, and the merge completed without overriding a protected
  branch requirement.
