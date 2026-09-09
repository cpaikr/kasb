# Release CLI version checking

## Current state

- Publication is authorized. Target version is v0.4.2; latest published release
  remains v0.3.3 until strict publication succeeds.
- The v0.4.0 and v0.4.1 tags are preserved. Neither attempt published assets.
- [v0.4.0](https://github.com/cpaikr/kasb/actions/runs/34299379084) exposed
  Windows canonical-drive-prefix handling. The fix validates complete roots
  and rejects incomplete prefixes; v0.4.1 passed the full Windows CLI and
  installer tests, all four native builds, and all 28 Node consumer checks.
- [v0.4.1](https://github.com/cpaikr/kasb/actions/runs/34301515003) stopped at
  the sealed installer consumer's stale requirement to request the retired
  `/releases/latest` endpoint. Removing that unused fixture route preserves
  checks for the release-list, exact-tag, archive, and checksum requests.
- The corrected consumer passed locally against the exact sealed macOS
  candidate downloaded from v0.4.1 CI. Independent review passed.

## Next step

Prepare v0.4.2 through `bun run release patch --ci`. Follow strict publication
through all candidate and consumer gates; verify immutable assets, then update
this record and [release posture](../docs/release.md).
