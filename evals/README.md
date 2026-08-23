# Evals

This directory holds internal evaluation artifacts for KASB capability ergonomics. It is not a public transport surface.

## Typed tool eval track

`typed-tools.ts` exposes internal `kasb_*` tool-like definitions mapped to the
canonical Node toolset operations:

- tool names are namespaced for agent use, such as `kasb_search_standards` and `kasb_get_section`
- inputs use capability JSON field names such as `stdNum`, `indexDocumentId`, `paraNum`, and `docNumber`
- schemas are the same JSON Schema exports used by the public Node toolset
- production execution delegates through the Rust-backed Node SDK
- CLI command names, stream behavior, and exit-code behavior remain covered by CLI tests instead

Scenario tests inject caller-owned fixture operations so orchestration remains
deterministic and cannot become a second KASB conformer. Use the production
definitions for capability-level evals where subprocess and argv parsing would
hide schema or result-shape problems.

## Scenario eval track

`scenarios.ts` defines fixture-friendly multi-step research workflows over the typed tools. Scenarios are split into:

- `tuning`: representative tasks used to improve naming, schemas, output shape, and recovery hints
- `held-out`: tasks kept separate from tuning so later changes can be checked against less-rehearsed workflows

Each run records task success, tool-call count, failed/invalid calls, retry calls, runtime, output bytes as a token proxy, and reference-field availability. Scenario assertions also carry a `diagnosticArea` (`naming`, `schema`, `output_shape`, `source_behavior`, or `fixture_or_runner`) so failures can be grouped by the design seam they exercise. The current scenarios cover lease standard discovery, section retrieval, Q&A search-to-detail retrieval, paragraph comparison, and recovery from a browser-route `titleDocumentId` mistake.
