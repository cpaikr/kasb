# Release

Release Please owns normal version bumps, `CHANGELOG.md`, source tags, and GitHub Releases for the npm package `@sjunepark/kasb`. The tag-triggered release workflow validates the package and publishes the npm CLI/tool package.

This repo no longer builds or uploads standalone OS-native binaries.

## Manual setup

Configure npm trusted publishing for `@sjunepark/kasb`:

- Publisher: GitHub Actions
- Organization or user: `sjunepark`
- Repository: `kasb`
- Workflow filename: `release.yml`

Configure this secret in the repository:

- `RELEASE_PLEASE_TOKEN`: token used by `.github/workflows/release-please.yml` to open release PRs and create source tags/releases. Use a fine-grained PAT or GitHub App token, not the default `GITHUB_TOKEN`, so Release Please-created tags trigger `.github/workflows/release.yml`. Grant this repository Contents read/write and Pull requests read/write access.

npm publishing uses OIDC trusted publishing, so no npm publish token is required.

## Automated release flow

1. Land normal work on `main` using Conventional Commits, especially `feat:`, `fix:`, and `docs:`. Use `!` or a `BREAKING CHANGE:` footer for breaking changes.
2. `.github/workflows/release-please.yml` opens or updates a release PR that bumps `package.json`, updates `.release-please-manifest.json`, and writes `CHANGELOG.md`.
3. Review and merge the release PR.
4. Release Please creates the source tag and GitHub Release.
5. The source tag triggers `.github/workflows/release.yml`, which typechecks, tests, builds, and publishes the npm package.

The source tag must match `package.json` exactly. Version `x.y.z` uses source tag `vx.y.z`.

## Manual fallback

If automation needs to be bypassed, update `package.json` and `.release-please-manifest.json` to the same version, commit the change, and push a matching source tag:

```sh
git tag vx.y.z
git push origin main --tags
```

To republish an existing source tag without moving it, run the `Release` workflow manually with the `tag` input set to the existing tag, for example `v0.1.2`.

The workflow is idempotent. If the npm package version already exists, npm publish is skipped.
