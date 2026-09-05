# Perform the first Rust/Node product release

## Outcome

Publish the completed Rust CLI, standalone installers, checksums, and provenance
through the canonical GitHub Release. The public Rust SDK source is versioned
by the same tag. npm publication is excluded from the current authorization;
crates.io remains a separate distribution decision.

## Current state

The Rust/Node rewrite is merged, but existing public versions through `0.2.1`
belong to the retired TypeScript/Pi product. PRs #22 and #23 completed the
release contract, managed install/upgrade behavior, canonical publication
pipeline, review, and exhaustive non-publishing rehearsal.

On 2026-09-04 the user authorized the GitHub-only release, public visibility
following a privacy audit, deletion of affected Actions logs, and creation of
a read-only policy App scoped only to this repository. CLI authentication and
GitHub Mobile verification succeeded. The selected release identity is `0.3.0`;
GitHub tags/releases and all five npm package versions were vacant when checked.
The npm publication job is hard-disabled and validated.

A fresh mirror of all remote branches, tags, and pull-request heads covered
204 commits. The only scanner match was an invalid private-key test fixture;
independent tracked-content review found no private data blocker. Comments and
100 retained Actions log archives were also scanned. The 71 archives exposing
Blacksmith runner tokens were deleted with authorization; run results and
artifacts remain. Linux container builds now use GitHub-hosted runners with
unchanged pinned manylinux images. Both fresh Linux jobs passed and their full
logs had no scanner findings or runner-token occurrences. The repository is now
public, verified through unauthenticated GitHub API access.

The KASB Release Policy App is installed only on `cpaikr/kasb`, with read-only
Administration, Contents, and mandatory Metadata access, and no webhook.
Release immutability is enabled. Chrome blocked downloading the generated App
key, so the environment private key remains unavailable. The `github-release`
environment now requires review by `sjunepark`, permits only `v*` tags, and holds
the environment-only sentinel and App client identifier. The signing-key secret
remains the manual setup step.

PR #26 carries the release-readiness implementation. Its previous head
`1571e46` passed CI and the complete four-target rehearsal; the current version,
runner remediation, and GitHub-only guard require fresh validation. Local
release checks and publication failure-injection tests pass. The first fresh
run exposed notices with the old workspace version and upgrade fixtures assuming
`0.1.1` was newer than the binary. Notices are regenerated, and upgrade fixtures
now derive a newer patch version; license checks and all local upgrade tests pass.
Fresh remote validation remains required. No production tag or release has been
created.

## Next action

Deliver the reviewed release preparation through PR #26 and verify fresh
four-target CI. Save the policy App signing key in the protected environment,
then publish the exact validated `0.3.0` GitHub assets. Keep npm disabled
throughout this release.
