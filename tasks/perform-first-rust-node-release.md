# Perform the first Rust/Node product release

Status: complete. Published on 2026-09-08 with explicit user authorization.

## Delivered outcome

[v0.3.3](https://github.com/cpaikr/kasb/releases/tag/v0.3.3) is the first
Rust/Node product release, from source
`26ee6339853dce95174a17a5a8ab031368d072a2`. GitHub reports the release as
immutable, non-draft, and non-prerelease, published at `2026-09-08T04:00:26Z`.

The release contains the standalone CLI archives for Linux GNU x64/ARM64,
macOS ARM64, and Windows x64, plus `install.sh`, `install.ps1`, `SHA256SUMS`,
and `provenance.json`. The public Rust SDK source is versioned by the same tag.
Node SDK tarballs remain validated CI candidate artifacts; npm registry
publication is absent, and crates.io remains a separate distribution decision.
[Release posture](../docs/release.md) owns ongoing operations and prerequisites.

## Validation evidence

[Canonical publication run 34184165482](https://github.com/cpaikr/kasb/actions/runs/34184165482)
succeeded through source validation, deterministic gates, all four native
platform builds, packed consumers across supported Node versions, platform
installer/upgrade checks, candidate sealing, and exact immutable publication.
Full local `bun run verify` also passed during release preparation.

Post-publication verification downloaded every release asset, verified all
`SHA256SUMS` entries and all eight GitHub asset digests, and matched provenance
to the tagged source commit. The
published shell installer installed successfully into a temporary directory on
macOS ARM64. The binary reported `kasb 0.3.3`, passed CLI help checks, and
`upgrade --check` confirmed a managed installation at the latest version with
no available update.

The user authorized commit, push, and CLI publication on 2026-09-08.
Earlier authorized privacy review and Actions-log remediation made the
canonical repository public without a remaining private-data blocker.
Affected runner-token logs were deleted, Linux container jobs moved to
GitHub-hosted runners, and fresh Linux logs passed scanning. Repository release
immutability was enabled and the final release's immutable state was verified.

## Preserved failed attempts

- [v0.3.1 run 34181271213](https://github.com/cpaikr/kasb/actions/runs/34181271213)
  failed before publication because a Windows installer test fixture passed
  an absolute `C:` archive path to tar, which interpreted it as a remote host.
  Fix `0643c64` reused the local-archive helper with a basename and working
  directory. No release was published; the tag is preserved.
- [v0.3.2 run 34182452960](https://github.com/cpaikr/kasb/actions/runs/34182452960)
  passed the complete candidate gates but failed during publication because
  release-by-tag discovery omitted drafts. Fix `f9535db` uses the authenticated,
  paginated release list and rejects duplicate matches. All ten empty drafts
  were removed after live capture verified draft discovery. No release was
  published; the tag is preserved.

Both corrections passed bounded code review and relevant tests before the
successful release. [Release flow alignment](../plans/release-flow-alignment.md)
records the pipeline decisions.
