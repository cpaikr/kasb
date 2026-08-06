# AGENTS.md

## Scope

- This repo is for a read-only KASB standards tool package, not a generic Markdown guide.
- The app design should follow `../darty`: a behavior-first capability core, neutral toolset, thin CLI/Pi transports, explicit source adapters, and typed contract/error boundaries.
- The first CLI/toolset/Pi implementation now exists. Treat broad docs as product and architecture guidance, while `TODO.md` tracks active hardening work.

## Read First

1. Start with [README.md](README.md).
2. Read [ARCHITECTURE.md](ARCHITECTURE.md) for document ownership, implemented layout, and Darty-parity boundaries.
3. Read [VISION.md](VISION.md) for product scope and non-goals.
4. Read [docs/research/kasb-standard-source-map.md](docs/research/kasb-standard-source-map.md) before changing source assumptions.
5. Read [docs/specs/kasb-standards-v1.md](docs/specs/kasb-standards-v1.md) before changing capability contracts.

## Commands

- Install deps: `bun install`
- Typecheck: `bun run typecheck`
- Test: `bun run test`
- Build npm CLI and package exports: `bun run build`
- Live checks: `bun run test:live`

Do not add placeholder build, lint, format, or test commands to docs. Document only commands that exist in `package.json`.

## CLI Tryouts

- Agents may run the local CLI from the repo root to inspect behavior and validate changes.
- Treat the CLI help output as the guide: start with `bun packages/kasb-ts/src/cli.ts --help`, then use `bun packages/kasb-ts/src/cli.ts help <command>` for command-specific usage.
- After `bun run build`, use `node packages/kasb-ts/dist/cli.js --help` to check the packaged entrypoint and import `packages/kasb-ts/dist/toolset.js`/`packages/kasb-ts/dist/pi.js` when package exports change.

Expected implementation stack, matching `../darty` unless a later decision changes it:

- Bun
- strict TypeScript
- Effect Schema for contracts and JSON Schema export
- Commander for CLI transport
- Bun test runner
- native `fetch` for the KASB JSON API

## Where Changes Go

- Product scope and non-goals: `VISION.md`
- Source evidence and observed API behavior: `docs/research/kasb-standard-source-map.md`
- Stable capability contracts: `docs/specs/`
- Tool-design rules shared across capabilities: `docs/tools/`
- Current work queue: `TODO.md`

## Working Rules

- Keep each idea in one canonical document and link to it instead of repeating it.
- Preserve Darty's layer split: CLI/Pi transports -> neutral toolset/app composition -> capability -> source adapter.
- Public JSON contracts use camelCase fields; CLI flags should use kebab-case.
- Keep raw KASB source identifiers and response shapes internal unless the spec explicitly promotes them.
- Mark source claims as observed, inferred, or unverified when that distinction matters.
- Keep the implementation read-only and citation-first with CLI, neutral toolset, and Pi as the public surfaces unless the product docs change that contract.
- Do not add MCP, browser-automation, database, or background ingestion goals without first changing the product docs.
