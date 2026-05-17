# Release

This repo publishes two artifacts for the same `package.json` version:

- npm package: `@sjunepark/kasb`
- standalone Bun-compiled binaries uploaded to `open-creo/open-creo` GitHub Releases

Release Please owns normal version bumps, `CHANGELOG.md`, source tags, and GitHub Releases. The Release workflow publishes npm and uploads standalone binaries from source tags.

## Manual setup

Configure npm trusted publishing for `@sjunepark/kasb`:

- Publisher: GitHub Actions
- Organization or user: `sjunepark`
- Repository: `kasb`
- Workflow filename: `release.yml`

Configure these secrets in this private repository:

- `RELEASE_PLEASE_TOKEN`: token used by `.github/workflows/release-please.yml` to open release PRs and create source tags/releases. Use a fine-grained PAT or GitHub App token, not the default `GITHUB_TOKEN`, so Release Please-created tags trigger `.github/workflows/release.yml`. Grant this repository Contents read/write and Pull requests read/write access.
- `OPEN_CREO_RELEASE_TOKEN`: fine-grained GitHub token that can create releases and upload assets in `open-creo/open-creo`. Grant repository Contents read/write access and authorize org SSO if required.

The public repository must allow release creation by the `OPEN_CREO_RELEASE_TOKEN` owner. npm publishing uses OIDC trusted publishing, so no npm publish token is required.

Protect `main` so release PRs cannot merge until `.github/workflows/ci.yml` passes. At minimum, require the `CI / validate` status check before merging. Release Please and CI both run from pushes to `main`, so branch protection is the gate that ensures release PR contents are validated before Release Please creates source tags and releases.

Ensure this repository can use the native runner labels in `.github/workflows/release.yml`, including the Linux arm64 and macOS arm64 runners. If your GitHub plan or organization uses different arm runner labels, update the matrix before tagging a release.

## Automated release flow

1. Land normal work on `main` using Conventional Commits, especially `feat:`, `fix:`, and `docs:`. Use `!` or a `BREAKING CHANGE:` footer for breaking changes.
2. `.github/workflows/ci.yml` validates pull requests with typecheck, tests, and the npm CLI build.
3. `.github/workflows/release-please.yml` opens or updates a release PR that bumps `package.json`, updates `.release-please-manifest.json`, and writes `CHANGELOG.md`.
4. Merge the release PR after CI passes.
5. Release Please creates the source tag and private GitHub Release.
6. The source tag triggers `.github/workflows/release.yml`, which validates the package again, publishes npm, builds standalone binaries, and uploads public binary assets to `open-creo/open-creo`.

The source tag must match `package.json` exactly. Version `x.y.z` uses source tag `vx.y.z` and public release tag `kasb-vx.y.z`.

## Manual fallback

If automation needs to be bypassed, update `package.json` and `.release-please-manifest.json` to the same version, commit the change, and push a matching source tag:

```sh
git tag vx.y.z
git push origin main --tags
```

To republish an existing source tag without moving it, run the `Release` workflow manually with the `tag` input set to the existing tag, for example `v0.1.0`.

The workflow is idempotent. If the npm package version already exists, npm publish is skipped and the public release assets are uploaded with `--clobber`.

Release binaries are built and smoke-tested on native GitHub-hosted runners for Linux x64, Linux arm64, macOS arm64, and Windows x64. macOS x64 is intentionally omitted because GitHub-hosted `macos-13` Intel runners can remain queued long enough to block publishing. The workflow uses the Bun version pinned in `package.json`.

## Local binary build

Build all release assets locally:

```sh
bun run build:binaries
```

Build and smoke-test one native target while testing the script:

```sh
bun run build:binaries --target bun-darwin-arm64 --outdir /tmp/kasb-bin --smoke-test
```

Release archives and `checksums.txt` are written under `dist-bin/release/` by default.
