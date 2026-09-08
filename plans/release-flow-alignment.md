# Align release delivery with mytech

Status: release-flow alignment locally validated; registry cleanup implemented
and reviewed with focused local checks passed; hosted rehearsal pending.

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
  checksums, and provenance. No production release is part of this change.

## Validation

- Before the registry cleanup, `bun run verify` passed local contracts,
  generation, licenses, typechecks, product/installer tests, release regressions,
  conformance, build, formatting,
  and clippy. The final preparation changes passed focused release tests.
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

## Next step

Integrate the change and run a non-publishing hosted rehearsal for fresh
four-target evidence. Follow [release posture](../docs/release.md) for operations;
[the first-release task](../tasks/perform-first-rust-node-release.md) owns
production version reconciliation and publication. The workspace remains at
`0.3.0`; no production tag, package, release, or remote configuration changed.
