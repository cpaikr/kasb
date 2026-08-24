# Goal: Make KASB release-ready without publishing

Status: complete
Planning scope: ROADMAP.md

## Original contract

Goal contract
- Outcome: Make KASB release-ready through one versioned, target-derived standalone/npm distribution contract with receipt-owned upgrades and a fully validated four-target publication pipeline, without publishing a real release.
- Goal state: goals/canonical-release-readiness.md
- Included results and sources (semantic results define scope; paths supply detail):
  - Canonical release identity and target-derived artifacts — plans/release-contract-and-managed-upgrades.md, native-targets.json, docs/release.md
  - Checksummed standalone installation and recoverable managed upgrades — plans/release-contract-and-managed-upgrades.md, crates/kasb-cli, ARCHITECTURE.md
  - Exhaustive release candidate and GitHub/npm publication automation — plans/canonical-release-pipeline.md, .github/workflows/ci.yml, scripts/validate-release-artifacts.mjs
- Complete when: Every included result achieves its cited outcome and applicable completion criteria within its named semantic boundary; the non-publishing four-target candidate passes; repository-required validation and review pass; planning is truthful; Delivery finishes.
- Excluded: Selecting the first production version, changing repository visibility, creating or moving a release tag, publishing a GitHub Release, or publishing registry packages.
- Authority: Execute only included results and necessary supporting work; resolve remaining decisions within that closed outcome using best judgment; record anything else and ask before scope expansion or external authority.
- Resume: Initialize this contract with $progress goal mode before work; recover it before every resume, continuation, compaction, or handoff; stop if recovery fails.
- Delivery: PR delivery — use $progress's PR lifecycle and the fewest sequential reviewable PRs; finish each through $create-pr and $address-pr-feedback before starting the next, including the final implementation slice.

## Authorized amendments

_None._

## Execution status

### Completed included results

- The canonical release, installation, and managed-upgrade contract merged in
  PR #22 at `e9c707d`. Cargo workspace metadata now owns the development
  version, `native-targets.json` derives all four supported artifact identities,
  generated installers enforce checksummed immutable-release installation, and
  receipt-owned CLI upgrades are bounded and recoverable.
- The canonical candidate and guarded publication pipeline merged in PR #23 at
  `8e86a86`.
  One reusable workflow now builds, consumes, aggregates, and seals the exact
  four-target candidate, while tag-only protected jobs project those validated
  bytes to GitHub and npm without rebuilding.

### Final delivery

PR #23 delivered the final implementation slice to the release-readiness
integration branch, and PR #25 delivered the reviewed closeout record. No
production version, repository visibility, tag, GitHub Release, npm package,
or external KASB state changed.

### Next in-scope action

None — goal complete.

### Evidence and blockers

- The Rust/Node rewrite is complete and merged to `main` by PR #20. Its
  deterministic and Linux-native Blacksmith checks passed on the final merged
  revision.
- PR #21 merged the two release plans, active goal record, and truthful
  rewrite-completion documentation into commit `80eea30` on the goal integration
  branch.
- PR #22 merged the reviewed release, installation, and managed-upgrade
  implementation at `e9c707d`. Final hosted CI run `32690717196` passed
  deterministic validation, generated PowerShell installer execution on hosted
  Linux and Windows, Windows upgrade compilation, root npm immutability, both
  continuously tested Linux native targets, and aggregate artifact validation.
  CodeRabbit's actionable review findings were resolved before merge.
- The merged contract makes Cargo workspace version `0.1.0` the current
  development identity; npm packages, four target-derived standalone archives,
  generated installers, checksums, CLI identity, and receipts derive from it.
  It does not select the first production version.
- The four-target identity contract covers Linux GNU x64/ARM64, macOS ARM64,
  and Windows x64. Continuous native CI remains intentionally Linux-only;
  fresh native and clean-consumer evidence for all four targets is a completion
  gate for the non-publishing candidate slice.
- `cpaikr/kasb` remains the single canonical source and release repository.
  This goal implements and validates that binding without changing its current
  private visibility; making it public is an external prerequisite for the
  separately authorized first release.
- Before any separately authorized publication, operators must verify public
  repository visibility, repository release immutability, protected release
  environment rules, and npm trusted-publisher registrations. This goal may
  encode and test those gates but may not configure or bypass them.
- No production version, release tag, GitHub Release, registry publication, or
  external KASB mutation is authorized.
- Canonical completion evidence for PR #23, its final implementation head,
  hosted CI and candidate runs, sealed artifact digest, and review closure is
  recorded in `plans/canonical-release-pipeline.md`. No real release or external
  publication mutation occurred.
- PR #25 merged the reviewed closeout at `0a3c769`. Its exact-head CI run
  `32718048460` and non-publishing four-target candidate run `32718048436`
  passed, and all five Codex review threads were resolved before merge.
- PR #24 was a divergent, conflicting duplicate whose latest candidate run
  failed before aggregate sealing. It was closed as superseded by the green
  PR #23 and PR #25 integration path and was not merged.
