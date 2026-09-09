# Release CLI version checking

Status: complete (2026-09-09).

## Outcome

[v0.4.2](https://github.com/cpaikr/kasb/releases/tag/v0.4.2) published from
`fe747a3298513e51172ea6fa631b2d71eb72ed83` as an immutable GitHub Release.
It delivers cached CLI update advisories and explicit `version-check` reports.
[Release posture](../docs/release.md) owns current distribution operations.

## Validation

- [Strict release run](https://github.com/cpaikr/kasb/actions/runs/34303290030)
  passed deterministic gates, all four native targets, 28 clean Node consumer
  checks, and all four sealed installer/upgrade consumers.
- The publication receipt reports success and immutability for the four CLI
  archives, checksums, both installers, and provenance. The GitHub API confirms
  a published, stable, immutable release with the expected assets.
- The downloaded macOS archive matched its published SHA-256 checksum. Its CLI
  reported `kasb 0.4.2`; a fresh live `version-check` selected v0.4.2 and
  reported an equal version. The check used a temporary cache and did not
  replace the user's installed CLI.

## Recovery decisions

The v0.4.0 and v0.4.1 tags remain preserved; neither attempt published assets.
[v0.4.0](https://github.com/cpaikr/kasb/actions/runs/34299379084) exposed Windows
canonical-drive-prefix handling, fixed by validating complete roots and
rejecting incomplete prefixes.
[v0.4.1](https://github.com/cpaikr/kasb/actions/runs/34301515003) exposed a stale
sealed-consumer assertion for the retired `/releases/latest` endpoint. The
corrected test retains required release-list, exact-tag, archive, and checksum
coverage. Both fixes passed independent review and the final strict pipeline.
