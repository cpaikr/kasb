# Architecture

This repo tracks `../darty`'s app design while applying it to KASB standards access.

The system is a CLI-first, read-only TypeScript app:

- `src/`: reusable capability core, source adapters, CLI transport, and app composition
- `fixtures/`: captured KASB API responses for deterministic tests
- `test/`: CLI, fixture-backed, contract, and opt-in live checks
- `evals/`: later scenario evals after CLI behavior stabilizes

The first CLI implementation exists. This document defines implemented boundaries and ongoing direction; exact files should follow the proven code shape rather than precommitting unused modules.

## Big Picture

The CLI is not the real app. The capability layer is: a semantic request contract, a provider interface, and an execution path that validates inputs, calls KASB source adapters, normalizes source results, and shapes typed success envelopes or typed failures.

The first public capabilities are:

- `search-standards`
- `get-standard-structure`
- `get-section`
- `get-paragraph`
- `search-qna`
- `get-qna`

The CLI is the only planned public interface. MCP, SDK, Pi-native tools, database persistence, and background ingestion are not implementation goals for this repo.

## Layering

```mermaid
graph TD
    subgraph CLI["CLI Transport · src/cli/"]
        CMD["Commander commands · flags · help · presentation"]
    end

    subgraph App["App Composition · src/app/"]
        APP["Operation name · schemas · provider wiring"]
    end

    subgraph Cap["Capability Contracts · src/capabilities/"]
        CAP["Request/result schemas · validation · execution"]
    end

    subgraph Src["Source Adapters · src/sources/kasb/"]
        SRC["KASB API request builders · fetchers · source models · normalizers"]
    end

    CMD --> APP
    APP --> CAP
    CAP --> SRC
    SRC --> KASB[("db.kasb.or.kr/api")]
```

| Layer | Path | Owns |
|---|---|---|
| CLI transport | `src/cli.ts`, `src/cli/` | Parse CLI input, own help/examples/output flags, call shared operations, serialize JSON |
| App composition | `src/app/` | Operation names, JSON Schemas, and default provider wiring for the CLI |
| Capability | `src/capabilities/` | Public semantic request/result schemas, request resolution, typed failures, execution |
| Source | `src/sources/kasb/` | KASB API URLs, source response schemas, fetchers, normalization, source error mapping |

## Implementation Roots

- `src/app/` for operation composition and default wiring
- `src/capabilities/` for public contracts and execution
- `src/cli/` for Commander commands, flags, help, and JSON serialization
- `src/sources/kasb/` for KASB endpoint access and source normalization
- `fixtures/`, `test/`, and `evals/` for captured source responses, verification, and later task scenarios

The first implementation established the current per-capability file shape. Continue that pattern unless a concrete refactor improves the layer boundaries.

## Behavior-First Core

The shared layer owns semantic behavior. The CLI owns presentation and protocol details.

```mermaid
graph LR
    CONTRACT["Effect Schema contracts"] --> VALIDATE["Runtime validation"]
    CONTRACT --> TS["TypeScript types"]
    CONTRACT --> SPEC["JSON Schema export"]
    SPEC --> APP["operation wiring"]
    APP --> CLI_META["CLI command names"]
    CONTRACT --> RESULT["success result envelope"]
```

One source of truth should provide:

- runtime validation shape
- TypeScript request/result types
- success result schema
- JSON Schema for CLI-facing specs
- typed failure mapping

What stays CLI-local:

- CLI flags
- help text and examples
- pretty/verbose output controls
- terminal presentation

## Runtime Flow

Runtime CLI flow:

```text
argv -> CLI transport -> app operation -> capability execution -> KASB source adapter -> https://db.kasb.or.kr/api/...
```

## Public Contract vs Source Contract

Keep two schema families separate:

- **Public capability schemas** use stable semantic fields such as `keyword`, `stdNum`, `indexDocumentId`, and `paraNum`.
- **Internal source schemas** model KASB response and endpoint details, including fields such as `searchWord`, `titleDocumentId`, `bigSeq`, `midSeq`, `smallSeq`, `littleSeq`, `documentType`, and raw paragraph HTML.

`titleDocumentId` is browser-route-facing and must stay internal in v1. `indexDocumentId` is the public v1 section retrieval id.

## Document Ownership

- [README.md](README.md)
  Minimal project orientation, status, reading order, and implementation roots.
- [VISION.md](VISION.md)
  Product-level goal, scope, principles, and non-goals.
- [docs/research/kasb-standard-source-map.md](docs/research/kasb-standard-source-map.md)
  Durable source investigation notes and observed API behavior.
- [docs/specs/](docs/specs/README.md)
  Stable, evidence-backed capability specs.
- [docs/tools/](docs/tools/foundations.md)
  Shared single-tool design guidance.
- [PRMOPT.md](PRMOPT.md)
  Historical implementation context for the accepted stack and first scaffold choices.
- [ROADMAP.md](ROADMAP.md)
  Historical phased direction and broad release sequencing.
- [TODO.md](TODO.md)
  Ordered near-term queue.
- `src/`
  Implementation root for the KASB capability core, source adapters, app composition, and CLI.

## Contributor Flow

1. Start with [README.md](README.md).
2. For product scope, read [VISION.md](VISION.md).
3. For source behavior, read [docs/research/kasb-standard-source-map.md](docs/research/kasb-standard-source-map.md).
4. For capability contracts, read [docs/specs/kasb-standards-v1.md](docs/specs/kasb-standards-v1.md).
5. For app layout and layer boundaries, use this file and keep parity with `../darty` where it still fits KASB.
6. For active work, use the ordered queue in [TODO.md](TODO.md).

## Invariants

- Public JSON request fields use camelCase; CLI flags use kebab-case.
- The success result schema contains `result`, `metadata`, `references`, and `warnings`; typed failures are separate from success schemas.
- Source adapters may know raw KASB fields; public capabilities expose stable semantic fields unless the spec explicitly promotes a source-facing exception, such as `search-qna.types`.
- Provider implementations return capability-shaped results, not raw source payloads.
- CLI commands import app/capability surfaces, not `sources/kasb/*` internals.
- CLI help, examples, and presentation options stay CLI-local.
- CLI success output is JSON on `stdout`; CLI failure output is JSON on `stderr` with nonzero exit code and empty `stdout`.
- MCP, SDK, Pi-native tools, database persistence, and background ingestion are not current implementation targets.
- Mark source observations as observed, inferred, or unverified when they affect contracts.

## Current Status

The repo currently has docs, source evidence, a v1 spec, and a Darty-shaped Bun/TypeScript CLI implementation.

Implemented roots:

- `package.json`
- `src/`
- `fixtures/`
- `test/`
- `scripts/build-cli.ts`

The current milestone is to keep hardening the implementation with broader contract tests, source-drift coverage, CLI entrypoint coverage, and docs/examples after command behavior settles.
