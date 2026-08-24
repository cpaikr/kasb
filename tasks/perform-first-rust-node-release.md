# Perform the first Rust/Node product release

## Outcome

The completed Rust CLI, Node SDK, native packages, standalone installers, and
managed-upgrade path are published under one new version through the canonical
GitHub Release and its npm projection. The public Rust SDK source is versioned
by the same tag; crates.io remains a separate distribution decision.

## Current state

The Rust/Node rewrite is merged, but existing public versions through `0.2.1`
belong to the retired TypeScript/Pi product. PRs #22 and #23 completed the
release contract, managed install/upgrade behavior, canonical publication
pipeline, review, and exhaustive non-publishing rehearsal. Repository
instructions still require separate authorization for the external setup,
version selection, tag, GitHub Release, and registry publication.

## Next action

Request explicit authorization to make `cpaikr/kasb` public, enable and verify
repository release immutability, configure and verify protected release
environments and npm trusted publishing, select the new version, create its
tag, and perform real GitHub/npm publication. Do not mutate any of those
external settings or release identities before that approval.
