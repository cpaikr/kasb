# Align release delivery with mytech

Status: release preparation and four-target candidate verification complete.
`v0.3.2` publication failed during draft discovery; the correction passed
bounded review and release-pipeline tests. The next release attempt is `v0.3.3`.

## Decisions

- Adopt local release-it preparation and tag-triggered CI publication, following
  `../krx-cli`, while retaining Cargo as the version authority.
- Reuse KASB's complete candidate and exact-artifact publication pipeline.
- Remove GitHub publication environment sentinels and the release-policy App
  requirement. The job token cannot inspect repository administration settings;
  final release immutability remains mandatory and is verified after publication.
- Keep all four targets verified, standalone installers and managed upgrades,
  and Node SDK packaging. Remove the legacy npm registry publisher, registry
  state checks, and its credential gates. Node tarballs remain CI candidate
  evidence; GitHub Release assets remain standalone archives, installers,
  checksums, and provenance. Publication was separately authorized below.

## Validation

- Before the registry cleanup, `bun run verify` passed local contracts,
  generation, licenses, typechecks, product/installer tests, release regressions,
  conformance, build, formatting, and clippy. The final preparation changes passed focused release tests.
- An isolated checkout exercised real version synchronization and release
  identity validation. This exposed Bun 1.3.13 retaining stale workspace versions;
  preparation now synchronizes only that metadata, preserves third-party
  resolution bytes, and verifies a frozen install.
- An actual release-it dry run preserved the checkout and Git state. Injecting
  verification failure after preparation preserved the version/changelog edits
  without creating a commit, tag, or push to the isolated local remote.
- Bounded code review and a focused follow-up on lockfile synchronization found
  no actionable issues.
- Registry cleanup passed `bun run test:release-pipeline`, `bun run native:check`,
  `bun run release:check`, and `bun run native:feasibility` on macOS ARM64 with
  Node 24.15.0. Bounded code review found no actionable issues; scoped
  documentation reconciliation is complete. Full `verify` was not rerun for
  this cleanup.

## Release execution

- The user authorized commit, push, and CLI publication on 2026-09-08.
- Pipeline commit `d399ed9` and release preparation commit `8a259ab` are pushed
  to `main`; tag `v0.3.1` identifies the release candidate.
- Full local `bun run verify` passed during release preparation; generated
  release identities and changelog passed bounded review.
- [Canonical publication run 34181271213](https://github.com/cpaikr/kasb/actions/runs/34181271213)
  passed source, deterministic gates, and all platform builds, but the Windows
  installer fixture failed because tar interpreted an absolute `C:` archive
  path as a remote host. No GitHub Release was published. The tag is preserved.
- The fixture now reuses the existing local-archive invocation helper to keep
  the archive basename separate from its Windows working directory.
- Fixture fix `0643c64` and release preparation `836e9f0` are pushed to `main`.
  Full local verification passed for `0.3.2`; tag `v0.3.2` started
  [publication run 34182452960](https://github.com/cpaikr/kasb/actions/runs/34182452960).
  All four platform builds, packed consumers, installer/upgrade checks, and
  candidate sealing passed. Publication failed because the release-by-tag API
  omitted drafts, causing the executor to create repeated empty drafts. No
  GitHub Release was published; the tag is preserved.
- Publication-state capture now discovers matching drafts through the
  authenticated, paginated release list and rejects duplicate matches. Bounded
  code review found no actionable issues and `bun run test:release-pipeline`
  passed. Live capture recognized a remaining draft after duplicate removal;
  all ten empty drafts from the failed attempt were then removed.

## Next step

Commit the discovery correction and prepare
`v0.3.3` through the authorized release flow. Follow its candidate and
publication gates, then verify the immutable release assets before reconciling
the delivery record in
[the first-release task](../tasks/perform-first-rust-node-release.md) and
[release posture](../docs/release.md).
