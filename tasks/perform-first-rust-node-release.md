# Perform the first Rust/Node product release

## Outcome

The completed Rust SDK, Rust CLI, Node SDK, native packages, standalone
installers, and managed-upgrade path are published under one new version through
the canonical GitHub Release and its npm projection.

## Current state

The Rust/Node rewrite is merged, but existing public versions through `0.2.1`
belong to the retired TypeScript/Pi product. The release contract, managed
install/upgrade behavior, and canonical publication pipeline are scheduled in
the roadmap and must be completed before a release is attempted. Repository
instructions still require separate authorization for version selection, tags,
GitHub Releases, and registry publication.

## Next action

After both scheduled release plans pass review and exhaustive dry-run
validation, request explicit authorization for the new version and real
GitHub/npm publication; do not select a version, create a tag, or publish before
that approval.
