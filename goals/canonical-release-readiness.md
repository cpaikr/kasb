# Goal: Make KASB release-ready without publishing

Status: active
Planning scope: ROADMAP.md

## Original contract

Goal contract

- Outcome: Make KASB release-ready through one versioned, target-derived
  standalone/npm distribution contract with receipt-owned upgrades and a fully
  validated four-target publication pipeline, without publishing a real
  release.
- Goal state: `goals/canonical-release-readiness.md`
- Included results and sources (semantic results define scope; paths supply
  detail):
  - Canonical release identity and target-derived artifacts —
    `plans/release-contract-and-managed-upgrades.md`, `native-targets.json`,
    `docs/release.md`
  - Checksummed standalone installation and recoverable managed upgrades —
    `plans/release-contract-and-managed-upgrades.md`, `crates/kasb-cli`,
    `ARCHITECTURE.md`
  - Exhaustive release candidate and GitHub/npm publication automation —
    `plans/canonical-release-pipeline.md`, `.github/workflows/ci.yml`,
    `scripts/validate-release-artifacts.mjs`
- Complete when: Every included result achieves its cited outcome and
  applicable completion criteria within its named semantic boundary; the
  non-publishing four-target candidate passes; repository-required validation
  and review pass; planning is truthful; Delivery finishes.
- Excluded: Selecting the first production version, changing repository
  visibility, creating or moving a release tag, publishing a GitHub Release,
  or publishing registry packages.
- Authority: Execute only included results and necessary supporting work;
  resolve remaining decisions within that closed outcome using best judgment;
  record anything else and ask before scope expansion or external authority.
- Resume: Initialize this contract with `$progress` goal mode before work;
  recover it before every resume, continuation, compaction, or handoff; stop if
  recovery fails.
- Delivery: PR delivery — use `$progress`'s PR lifecycle and the fewest
  sequential reviewable PRs; finish each through `$create-pr` and
  `$address-pr-feedback` before starting the next, including the final
  implementation slice.

## Authorized amendments

_None._

## Execution status

### Completed included results

_None._

### Current in-scope result

Establish the canonical release, installation, and managed-upgrade contract in
`plans/release-contract-and-managed-upgrades.md`. The release-pipeline plan is
sequenced after that contract because it must build and validate the resulting
versioned artifacts and upgrade behavior.

### Next in-scope action

Land the two reviewed release plans and this goal record, then implement one
canonical product-version source and a repository-owned validator that rejects
Cargo, npm, generated package, archive, binary, and release-metadata skew.

### Evidence and blockers

- The Rust/Node rewrite is complete and merged to `main` by PR #20. Its
  deterministic and Linux-native Blacksmith checks passed on the final merged
  revision.
- Local commit `1111c36` adds the two release plans and queues them in
  `ROADMAP.md`; it is the planning base for this goal and is not yet on
  `origin/main`.
- `native-targets.json` owns four supported targets, but does not yet own
  versioned standalone assets, installers, checksums, or receipts.
- Cargo currently reports product version `0.1.0`, while the root and generated
  native npm packages report `0.2.1`; no repository gate rejects that skew.
- The source repository is private. This goal includes choosing, implementing,
  and validating one canonical release-repository binding; changing repository
  visibility remains explicitly excluded.
- No production version, release tag, GitHub Release, registry publication, or
  external KASB mutation is authorized.
