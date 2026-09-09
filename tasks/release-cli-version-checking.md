# Release CLI version checking

## Current state

- Publication is authorized. Target version is v0.4.1; latest published release
  remains v0.3.3 until strict publication succeeds.
- The v0.4.0 tag is preserved. Its [release run](https://github.com/cpaikr/kasb/actions/runs/34299379084)
  passed deterministic gates and Linux/macOS native builds, but Windows cache
  unit tests failed before asset publication.
- A [Windows diagnostic](https://github.com/cpaikr/kasb/actions/runs/34300602896)
  confirmed that probing a bare canonical drive prefix returns OS error 1.
  Cache directory validation now waits for the root separator before probing.
- Local cache tests, formatting, Clippy, and independent review passed.
  The [Windows CLI run](https://github.com/cpaikr/kasb/actions/runs/34300729068)
  passed all 40 existing tests; its new regression exposed acceptance of an
  incomplete drive prefix. An explicit root-component guard fixes that edge,
  and the [focused Windows check](https://github.com/cpaikr/kasb/actions/runs/34301284555)
  passed. Full Windows validation will run again in the release gate.

## Next step

Prepare v0.4.1 through
`bun run release patch --ci`. Follow strict publication through all candidate
and consumer gates; verify immutable assets, then update this record and
[release posture](../docs/release.md).
