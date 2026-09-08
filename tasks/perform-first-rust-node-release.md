# Perform the first Rust/Node product release

## Outcome

Publish the completed Rust CLI, standalone installers, checksums, and provenance
through the canonical GitHub Release. The public Rust SDK source is versioned
by the same tag. npm registry publication has been removed from the pipeline;
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
The then-disabled npm publication job has since been removed by release flow
alignment; its registry checks and credential gates are also removed.

A fresh mirror of all remote branches, tags, and pull-request heads covered
204 commits. The only scanner match was an invalid private-key test fixture;
independent tracked-content review found no private data blocker. Comments and
100 retained Actions log archives were also scanned. The 71 archives exposing
Blacksmith runner tokens were deleted with authorization; run results and
artifacts remain. Linux container builds now use GitHub-hosted runners with
unchanged pinned manylinux images. Both fresh Linux jobs passed and their full
logs had no scanner findings or runner-token occurrences. The repository is now
public, verified through unauthenticated GitHub API access.

Release immutability was enabled during setup. The earlier policy App signing-key
blocker is superseded by [release flow alignment](../plans/release-flow-alignment.md):
GitHub publication now uses the workflow job token and requires no policy App
or `github-release` environment. Operators must still verify repository
immutability before publication; the final immutable-release check cannot
prevent publication under a mistakenly disabled setting. Current prerequisites
and recovery rules are owned by [release posture](../docs/release.md).

PR #26 carries the release-readiness implementation. Its previous head
`1571e46` passed CI and the complete four-target rehearsal; the current version,
runner remediation, and release-flow alignment require fresh validation. Local
release checks and publication failure-injection tests pass. The first fresh
run exposed notices with the old workspace version and upgrade fixtures assuming
`0.1.1` was newer than the binary. Notices are regenerated, and upgrade fixtures
now derive a newer patch version; license checks and all local upgrade tests pass.
Fresh remote validation remains required. No production tag or release has been
created.

## Next action

Obtain fresh four-target evidence through a manually dispatched rehearsal after
pipeline alignment is integrated. Local validation evidence and its coverage
are recorded in [release flow alignment](../plans/release-flow-alignment.md);
no fresh hosted rehearsal has run for it. The workspace remains at
`0.3.0`; this pipeline task does not publish or select a new release version.

Before production, reconcile the intended first-release version with the local
release flow, which requires a version increase, and confirm publication
authorization. Verify the external prerequisites, then follow
[local release preparation](../docs/release.md#local-release-preparation).
Pushing the authorized canonical tag starts strict publication; manually
dispatching either workflow only rehearses.
