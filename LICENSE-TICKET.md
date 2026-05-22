# Ticket: Apply a standard source-available license

## Goal

Adopt the same licensing posture used by `landprice`: a standard, SPDX-recognized source-available license with restrictions, rather than a custom private/proprietary license reference.

## Recommended license

Use **Elastic License 2.0** with SPDX identifier:

```json
"license": "Elastic-2.0"
```

## Tasks

- Add or replace `LICENSE.md` with the full Elastic License 2.0 text.
- Set `package.json` `license` to `Elastic-2.0` if this repo publishes an npm package.
- Ensure the npm package includes `LICENSE.md`.
- Keep the README license section minimal, for example:

  ```md
  ## License

  Elastic License 2.0. See [LICENSE.md](./LICENSE.md).
  ```

- Remove stale references to private repositories, custom proprietary terms, or obsolete terms files unless the project still needs separate non-license usage terms.

## Notes

Elastic License 2.0 is SPDX-recognized and works well for GitHub/npm metadata, but it is source-available rather than OSI open source.
