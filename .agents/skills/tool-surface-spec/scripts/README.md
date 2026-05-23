# Tool Surface Validation Scripts

`validate-tool-surface.mjs` is a dependency-free smoke checker for packages that follow the reusable tool package surface spec.

Run it after the target package has been built:

```bash
node skills/tool-surface-spec/scripts/validate-tool-surface.mjs /path/to/package
```

Useful options:

```bash
node skills/tool-surface-spec/scripts/validate-tool-surface.mjs . --id darty
node skills/tool-surface-spec/scripts/validate-tool-surface.mjs . --toolset-factory createDartyToolset --pi-factory createDartyPiTool
node skills/tool-surface-spec/scripts/validate-tool-surface.mjs . --run-cli
```

The script checks package shape, imports `./toolset` and `./pi`, validates operation metadata, verifies kebab-case operation names, checks retryable validation failures for recovery metadata, checks example inputs when provided, exercises Pi `help`/`command_help`/`validate`, verifies the shared `content[]` + `details` action envelopes, and optionally runs CLI help/invalid-command smoke checks.

It intentionally does **not** execute normal operations by default. That keeps the check safe for read-only, network-backed, or potentially expensive tools. Domain-specific `run` payload quality still needs human review or project-specific tests.
