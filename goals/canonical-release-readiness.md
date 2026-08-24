# Goal: Make KASB release-ready without publishing

Status: active
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

_None._

### Current in-scope result

Finish review and delivery of the canonical release, installation, and
managed-upgrade implementation on `codex/release-contract-upgrades`. The
release-pipeline plan remains sequenced after this contract because it must
build and validate the resulting versioned artifacts and upgrade behavior.

### Next in-scope action

Finish implementation PR #22 against the goal integration branch, record its
merged validation evidence, then start the four-target candidate and
publication-pipeline slice.

### Evidence and blockers

- The Rust/Node rewrite is complete and merged to `main` by PR #20. Its
  deterministic and Linux-native Blacksmith checks passed on the final merged
  revision.
- PR #21 merged the two release plans, active goal record, and truthful
  rewrite-completion documentation into commit `80eea30` on the goal integration
  branch.
- PR #22 carries the reviewed release, installation, and managed-upgrade
  implementation. Its local contract, test, conformance, build, formatting,
  clippy, license, native-workflow, and diff checks pass; required CI and
  hosted review are in progress.
- The implementation branch makes Cargo workspace version `0.1.0` the current
  development identity; npm packages, four target-derived standalone archives,
  generated installers, checksums, CLI identity, and receipts derive from it.
  It does not select the first production version.
- Local contract, installer, Node, Rust, formatting, clippy, license, and
  generated-file checks pass. PowerShell behavioral execution remains pending
  in required CI because `pwsh` is not installed on the local macOS host.
- `cpaikr/kasb` remains the single canonical source and release repository.
  This goal implements and validates that binding without changing its current
  private visibility; making it public is an external prerequisite for the
  separately authorized first release.
- No production version, release tag, GitHub Release, registry publication, or
  external KASB mutation is authorized.
