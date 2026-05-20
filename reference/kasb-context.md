# Code Context

## Files Retrieved
1. `package.json` (lines 1-40) - package identity, Bun/Node tooling, scripts, dependencies.
2. `README.md` (lines 1-7) - concise public purpose and stdout/stderr JSON behavior.
3. `ARCHITECTURE.md` (lines 14-95) - purpose, public capabilities, layer split, source-of-truth contract rule.
4. `docs/specs/kasb-standards-v1.md` (lines 1-160) - public capability boundary, naming conventions, success/failure envelopes, operations.
5. `docs/research/kasb-standard-source-map.md` (lines 1-120) - source evidence doc shape and observed-vs-contract distinction.
6. `src/capabilities/types.ts` (lines 1-145) - shared schemas, JSON Schema export helper, metadata, typed failures.
7. `src/capabilities/search-standards/contract.ts` (lines 1-132) - representative request resolver and result envelope contract.
8. `src/capabilities/search-standards/execute.ts` (lines 1-15) - thin execution wrapper mapping errors to public failures.
9. `src/app/search-standards.ts` (lines 1-21) - app operation object exposing name, input/result JSON Schemas, execute.
10. `src/sources/kasb/provider.ts` (lines 1-220) - source adapter/provider implementation and normalization pattern.
11. `src/sources/kasb/fetch-json.ts` (lines 1-54) - fetch abstraction, timeout, source error mapping.
12. `src/cli.ts` (lines 1-200) - Commander command definitions, option naming, examples, output projections.
13. `src/cli/commands/shared.ts` (lines 22-122) - reusable CLI command builder, parsing, output modes, failure detail hooks.
14. `test/cli/cli.test.ts` (lines 1-160) - CLI behavior tests for help, JSON failure envelopes, flag mapping.
15. `test/kasb-provider.test.ts` (lines 1-180) - fixture-backed provider tests with mocked `fetch`.
16. `test/capabilities/schema-exports.test.ts` (lines 1-120) - contract/schema export stability tests.

## Key Code

- Purpose/tooling: package is `@sjunepark/kasb`, a read-only Korean KASB standards/Q&A CLI, ESM, Bun-managed, Node >=20.18.1, `kasb` bin from `dist/cli.js`, scripts: `build`, `typecheck`, `test`, `test:live`; dependencies are only `commander` and `effect` (`package.json` lines 1-40).
- Architecture: CLI is intentionally thin; capability layer is the app core. Flow is `CLI -> app -> capabilities -> sources/kasb -> API` (`ARCHITECTURE.md` lines 14-60). Docs explicitly say one schema source should drive runtime validation, TS types, JSON Schema export, and typed failure mapping (`ARCHITECTURE.md` lines 72-92).
- Public API/client shape: each operation object exposes `{ name, inputJsonSchema, resultJsonSchema, execute }` and is created by injecting a provider (`src/app/search-standards.ts` lines 7-21). This is the closest reusable public/client surface even though CLI is the only planned public interface.
- Contract pattern: Effect Schema defines request/result types and annotations. A manual resolver normalizes untyped input, rejects unknown keys, applies defaults, and throws typed input errors (`src/capabilities/search-standards/contract.ts` lines 16-63). Result envelopes contain `result`, `metadata`, `references`, and `warnings` (`src/capabilities/search-standards/contract.ts` lines 100-131).
- Shared abstractions: `capabilitySchemaToJsonSchema` exports JSON Schema 2020-12 from Effect schemas (`src/capabilities/types.ts` lines 3-12). `ResultMetadataSchema` records source system, endpoint, observed source behavior, completeness, and content notes (`src/capabilities/types.ts` lines 44-81). Failures are typed as `KasbFailure`, `InvalidCapabilityRequest`, and `ProviderFailure`, with mapping to public failure codes (`src/capabilities/types.ts` lines 84-145).
- Provider/source split: capability execution calls provider methods, while `sources/kasb/provider.ts` owns URL calls, raw shape checks, normalization, metadata, warnings, and source-drift failures. Fetch is centralized with JSON `accept`, UA, 15s timeout, HTTP->`ProviderFailure`, JSON parse->`source_changed`, network->retryable `source_unavailable` (`src/sources/kasb/fetch-json.ts` lines 1-54).
- CLI abstraction: `buildOperationCommand` accepts operation metadata, typed option keys, output modes, result projection hooks, failure next-action hooks, and operation runner (`src/cli/commands/shared.ts` lines 22-40). It builds Commander commands, shows help when no options are passed, serializes JSON, and maps capability parameter errors back to CLI flags (`src/cli/commands/shared.ts` lines 48-108).
- Tests: schema export tests assert `$schema`, object shape, `additionalProperties: false`, required fields, and descriptions/examples for every input (`test/capabilities/schema-exports.test.ts` lines 91-118). CLI tests assert human help, stderr-only JSON failures, unknown-option suggestions, and required-option flag mapping (`test/cli/cli.test.ts` lines 15-160). Provider tests mock `globalThis.fetch` with fixture maps and validate normalized operation behavior (`test/kasb-provider.test.ts` lines 1-80).

## Architecture

KASB uses a behavior-first capability core with four stable layers:

1. `src/capabilities/<operation>/`: public semantic contracts, request resolution, provider interface, execution/error mapping, JSON Schema spec export.
2. `src/sources/kasb/`: source-specific URL construction, fetch, raw-source tolerance, normalization, metadata, source failures.
3. `src/app/`: operation composition and default provider wiring; exposes operation name/schemas/execute.
4. `src/cli.ts` + `src/cli/`: Commander transport, kebab-case flags, help/examples, output projections, JSON stdout/stderr rules.

Docs mirror that split: `README.md` is minimal; `ARCHITECTURE.md` owns layers/invariants; `VISION.md` owns product scope; `docs/research/*` owns observed source evidence; `docs/specs/*` owns stable contracts; `docs/tools/*` owns general tool design.

Naming conventions to reuse: operation IDs and CLI commands are kebab-case; JSON fields are camelCase; source/raw identifiers stay internal unless promoted by spec. Success envelopes never include `error`; failures are separate typed values/envelopes.

## Start Here

Start with `ARCHITECTURE.md`, then open `src/app/search-standards.ts` and `src/capabilities/search-standards/contract.ts`. Together they show the intended landprice pattern: app operation object over provider-injected capability execution over Effect Schema contracts.

## Recommendations for `../landprice` docs/context markdown

- Reuse the docs layout: minimal `README.md`, dedicated `ARCHITECTURE.md`, product `VISION.md`, `docs/research/<source-map>.md`, and `docs/specs/<domain>-v1.md`. Keep observed source behavior out of public contract docs until promoted.
- Reuse the layer split and names with domain substitutions: `src/capabilities/`, `src/sources/<source>/`, `src/app/`, `src/cli/`. Do not let CLI import source adapters directly.
- Reuse operation objects as the internal client shape: `{ name, inputJsonSchema, resultJsonSchema, execute(input) }`. This is sufficient for CLI, tests, and future tool definitions without committing to an SDK.
- Reuse envelope conventions: success `{ result, metadata, references, warnings }`; typed failure `{ code, message, retryable, parameter?, sourceUrl? }`; JSON success to stdout and JSON failure to stderr if landprice has a CLI.
- Reuse Effect Schema if landprice is TypeScript/Bun: one schema source for runtime validation, static types, JSON Schema export, and schema tests.
- Reuse manual request resolvers for precise input errors and defaults. Avoid relying only on schema decode if CLI/user-facing error quality matters.
- Reuse fixture-backed provider tests with mocked `globalThis.fetch`, plus opt-in live tests behind an env var. Add schema-export tests early.
- Reuse source metadata fields, but rename `system`, endpoint examples, and source behavior to landprice-specific values. Include observed/inferred/unverified status in research docs.
- Reuse CLI command builder only if landprice has multiple similarly shaped operations. For one or two commands, avoid over-abstracting until repetition appears.
- Avoid KASB-specific traps: do not expose raw source IDs just because they appear in URLs; first define stable public identifiers in the spec. Avoid broad multi-source abstractions, persistence, MCP/SDK goals, or browser automation unless landprice product docs explicitly require them.
