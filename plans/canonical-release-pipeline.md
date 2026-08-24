# Automate canonical GitHub and npm releases

## Outcome

A tag-triggered, repository-owned pipeline builds and verifies a complete KASB
release from one checkout, publishes immutable standalone assets through GitHub
Releases, and publishes npm only as an exact projection of that same versioned
artifact set.

## Current state

- `.github/workflows/ci.yml` is merge validation and release rehearsal, not a
  release workflow. It has no tag trigger, release environment, publication
  permission, or registry publishing job.
- Continuous CI builds the root npm tarball and Linux GNU x64/ARM64 native npm
  packages and direct CLI archives. It validates the complete continuously
  tested subset after clean-consumer checks across Node 20.18.1 and majors
  21–26.
- macOS ARM64 and Windows x64 are supported but intentionally omitted from
  continuous CI. `docs/release.md` correctly requires fresh evidence for every
  included target before future publication, and the default aggregate
  artifact validator already expects all four targets.
- Native artifact jobs currently do not depend on deterministic validation.
  GitHub Actions artifacts are temporary and are not canonical release assets.
- Historical tags, GitHub Releases, and npm versions through `0.2.1` describe
  the retired TypeScript/Pi product. The latest GitHub Release has no standalone
  binary assets.
- The source and canonical release repository is private, so unauthenticated
  installation and upgrades require the separately authorized visibility
  change before the first real release.

## Decisions

- Keep economical Linux-only continuous CI, but every release candidate builds
  and validates Linux GNU x64/ARM64, macOS ARM64, and Windows x64 freshly from
  the tagged checkout.
- Publication depends on deterministic contracts, generated freshness,
  licenses, typechecks, Rust and Node tests, adversarial conformance, builds,
  formatting, lints, every native build, every clean consumer, and aggregate
  artifact validation.
- Release jobs consume the immutable artifacts already validated by the
  candidate workflow. GitHub and npm publication do not rebuild them.
- Candidate metadata has shared strict and rehearsal modes. Strict mode requires
  the real `v<version>` tag and live publication-vacancy checks. Rehearsal mode
  binds the canonical source version to an unmistakable synthetic candidate
  ref and deterministic publication-state fixtures, while exercising the same
  artifact generators and validators without claiming or reserving a version.
- GitHub Release assets include every supported standalone archive, the
  checksum manifest, generated shell and PowerShell installers, and bounded
  source/revision/toolchain provenance.
- Assemble and validate the complete candidate before making it public. Use a
  draft GitHub Release or equivalent staging boundary so an incomplete asset
  set is never presented as complete.
- npm uses short-lived trusted publishing. Publish native platform packages
  first and the exact-version root `@sjunepark/kasb` package last; report any
  partial publication truthfully.
- crates.io publication is not silently inferred from the public Rust SDK.
  Rust crate versions remain compatible with the product release, while adding
  a crates.io channel requires an explicit distribution decision.
- Implementing the workflow does not authorize choosing a release version,
  creating or moving a tag, publishing a GitHub Release, or publishing any
  registry package.

## Scope

- Extract or add reusable validation and full-target candidate workflows so PR
  CI and tagged releases invoke the same repository-owned contracts at their
  appropriate breadth.
- Add a shared release metadata gate whose strict mode verifies the canonical
  version, `v<version>` tag, checked-out commit, clean generated state, target
  set, and absence of an already-published candidate identity before build or
  mutation, while rehearsal mode replaces only the tag and live-vacancy inputs.
- Bind workflow permissions, release URLs, provenance, installers, and upgrade
  discovery to `cpaikr/kasb` without duplicating canonical release state.
- Build the Node addon and Rust CLI once per target, then derive the native npm
  tarball and standalone archive from those exact binaries.
- Generate installers, checksums, and provenance from the release contract and
  validate the aggregate four-target candidate independently.
- Exercise the exact candidate archives, installers, receipts, CLI process
  contract, Node SDK, npm launcher, and managed-upgrade path in clean consumers
  on every supported target.
- Publish the staged GitHub Release and then the validated npm tarballs through
  protected release jobs with least-privilege permissions and explicit failure
  reporting.
- Update release operator documentation with trusted-publisher setup,
  environment protection, recovery boundaries, and the separately authorized
  first-release procedure.
- Remove or supersede stale release automation branches and documentation only
  when their recovery value has been reviewed explicitly; do not reuse the old
  TypeScript Release Please configuration blindly.

## Validation

- Candidate validation reconciles tag, checkout SHA, canonical version, Cargo
  metadata, npm metadata, archive names, binary-reported version, checksums,
  provenance, installers, and the exact supported target set.
- Every published file has already passed content allowlisting, license and
  notice freshness, secret/private-material inspection, checksum verification,
  and clean-consumer installation.
- Failure injection covers an incomplete target matrix, failed deterministic
  gates, upload interruption, duplicate versions, native-package partial npm
  publication, root-package failure, and safe rerun behavior without moving a
  published tag or replacing an immutable asset.
- The release workflow carries only the permissions needed by each job and uses
  trusted publishing rather than retained npm tokens.
- The existing deterministic and continuous Linux validation remains green and
  the full candidate workflow can be exercised without performing external
  publication.

## Completion criteria

- One reusable candidate workflow runs deterministic validation and builds,
  consumes, and aggregates the exact Linux GNU x64/ARM64, macOS ARM64, and
  Windows x64 artifacts derived from the canonical release contract.
- Strict and rehearsal metadata modes share all artifact and identity
  validation; only the real tag and live publication-vacancy inputs are
  substituted by explicit synthetic rehearsal inputs.
- Protected GitHub and npm publication jobs consume the validated candidate
  without rebuilding, declare least-privilege permissions, use npm trusted
  publishing, preserve immutable tag/asset rules, and cannot run from the
  non-publishing rehearsal path.
- Deterministic failure injection proves incomplete matrices, failed gates,
  interrupted uploads, occupied identities, partial npm publication, root
  failure, and safe reruns are detected and reported without moving tags or
  replacing immutable assets.
- Operator documentation identifies public repository visibility, protected
  environment configuration, and npm trusted-publisher registration as
  externally authorized first-release prerequisites and gives verification
  steps without performing them.
- The non-publishing four-target rehearsal passes on the exact candidate
  workflow, existing continuous validation remains green, repository-required
  review passes, the implementation PR is merged, and planning records the
  evidence truthfully.

## Next action

After the release and managed-upgrade contract satisfies its completion
criteria and merges, factor its build and validation commands into a
non-publishing full-target candidate workflow before adding guarded GitHub or
npm mutation jobs.
