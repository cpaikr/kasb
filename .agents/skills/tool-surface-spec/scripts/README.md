# Tool Surface Validation Scripts

`validate-tool-surface.mjs` is a dependency-free smoke checker for packages that follow the reusable CLI + neutral toolset package surface spec.

Run it after the target package has been built:

```bash
node skills/tool-surface-spec/scripts/validate-tool-surface.mjs /path/to/package --run-cli
```

Useful options:

```bash
node skills/tool-surface-spec/scripts/validate-tool-surface.mjs . --id darty # expected neutral toolset id
node skills/tool-surface-spec/scripts/validate-tool-surface.mjs . --toolset-factory createDartyToolset
node skills/tool-surface-spec/scripts/validate-tool-surface.mjs . --command ./dist/cli.js --run-cli
node skills/tool-surface-spec/scripts/validate-tool-surface.mjs . --command darty --run-cli
node skills/tool-surface-spec/scripts/validate-tool-surface.mjs . --command npx --command-args '["@sjunepark/darty"]' --run-cli
node skills/tool-surface-spec/scripts/validate-tool-surface.mjs . --run-cli --success-args '["--version"]'
node skills/tool-surface-spec/scripts/validate-tool-surface.mjs . --run-cli --invalid-args '["__validate_tool_surface_unknown__"]'
```

The script checks package shape, validates `bin` and `./toolset` targets when a `package.json` exists, imports the neutral toolset factory, checks required toolset methods and operation specs, verifies `--id` against the neutral toolset id when supplied, verifies unknown-operation validation, optionally runs CLI `--help`, verifies invalid CLI usage exits non-zero with exactly one JSON object on stdout, and verifies a caller-supplied safe success command exits 0 with exactly one JSON object on stdout.

It intentionally does **not** execute normal operations unless `--success-args` is provided. That keeps the check safe for read-only, network-backed, or potentially expensive tools. Domain-specific result quality still needs human review or project-specific tests.
