# Release posture

The repository produces releasable npm package contents and direct CLI
artifacts, but it does not publish them. Registry publication, package-version
selection, source tags, GitHub Releases, and external KASB mutation require
separate authorization.

The previous Release Please and tag-triggered npm publication workflows were
removed with the TypeScript product. There is no JavaScript fallback release
path and no install-time compilation or runtime download path.

## Artifact set

One revision produces:

- the root `@sjunepark/kasb` package from `packages/node`;
- exact-version optional packages for Linux GNU x64/ARM64, macOS ARM64, and
  Windows x64 from `packages/native`;
- one Node addon and the same-revision Rust CLI binary in each platform
  package; and
- direct Rust CLI archives built from those same binaries.

`native-targets.json` owns package names, target triples, compatibility floors,
support claims, and continuous-CI participation. Linux GNU artifacts require
glibc 2.28. Generated manifests and loaders must remain fresh. Continuous CI
validates the exact Linux artifact subset on Blacksmith; the default aggregate
validator still requires all four supported targets for any future release.

macOS ARM64 and Windows x64 are deliberately omitted from continuous CI to
reduce compute cost. They remain supported from the recorded cutover evidence,
but a future publication still requires fresh native evidence for every target
included in that release.

## Required evidence before any future publication

Before a separately authorized release can publish, the selected revision must
pass:

- deterministic contracts, adversarial conformance, Rust, Node, CLI, license,
  and generated-artifact checks;
- native builds and ABI-floor checks on every claimed target;
- direct CLI and clean packed npm consumers across the declared Node matrix;
- direct and npm-launched CLI process equivalence; and
- aggregate validation of the exact root, platform, and direct-CLI artifacts.

Platform packages must be published before the root package so its exact
optional dependencies already exist. The root and every platform package must
use one explicitly selected version and one revision. This document does not
select that version, authorize npm/GitHub mutation, or provide publication
commands.
