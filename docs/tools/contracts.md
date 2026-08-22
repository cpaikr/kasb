# Contracts

## Goal

A tool contract should make invalid usage hard and useful usage obvious.

This document covers the interface design conventions relevant to the KASB standards CLI.

## Input Design

Prefer inputs that are:

- `semantic`
  Use fields like `keyword`, `stdNum`, `indexDocumentId`, `paraNum`, or `sectionPath` instead of one overloaded free-form string. Match the public contract's naming style; keep raw source names in adapter internals.
- `bounded`
  Include scope, limits, offsets, and modes.
- `composable`
  Support filtering, lookup, and progressive retrieval instead of one monolithic request.
- `safe`
  Separate read-only operations from mutating or destructive ones.

Avoid:

- catch-all `query` parameters when a structured form exists
- mode switches that completely change the result shape
- hidden defaults that affect correctness
- raw text prompts as the primary interface for deterministic work
- leaking source-only ids such as `titleDocumentId` into public contracts without a spec decision

## Naming Conventions

- Public JSON request fields use camelCase.
- CLI commands and flags use kebab-case.
- Raw source fields keep their upstream names only inside source adapters and fixtures.

Examples:

- JSON: `indexDocumentId`
- CLI: `--index-document-id`
- source-only: `bigSeq`, `midSeq`, `titleDocumentId`

## Output Design

Most tools benefit from a consistent success envelope:

- `result`
  The structured payload the next step consumes.
- `metadata`
  Source endpoint, timing, version or observed behavior notes, partial flags, cache info.
- `references`
  Standard numbers, section ids, paragraph numbers, unique keys, source URLs, and related pointers.
- `warnings`
  Partial coverage, empty sections, source drift, fallback use, parsing or normalization uncertainty.

Typed failures are separate from the success schema. Do not put an `error`
field in a success result schema. For this repository's CLI, both operation
success and failure envelopes go to `stdout`; failures exit `1` and leave
`stderr` empty. The frozen replacement inventory in
[`../contracts/kasb-v1-compatibility.md`](../contracts/kasb-v1-compatibility.md)
owns the complete process contract.

## Output Modes

Many tools should expose:

- `summary`
  Small, agent-readable projection
- `structured`
  Schema-first payload for downstream steps
- `raw`
  Original JSON, HTML, XML, text, or source fragments when needed

This avoids the false choice between "too abstract" and "too verbose."

## Error Model

Treat errors as part of the product.

Useful public error categories:

- `invalid_input`
- `not_found`
- `unauthorized`
- `rate_limited`
- `source_unavailable`
- `source_changed`
- `partial_retrieval`
- `unsupported_surface`
- `internal_failure`

Each failure should say:

- whether retrying may help
- whether the input should change
- whether the upstream source changed
- what fallback path exists
- which parameter or source URL is relevant when known

CLI failure envelope:

```json
{
  "failure": {
    "code": "invalid_input",
    "message": "Missing required option --std-num.",
    "retryable": false,
    "parameter": "stdNum"
  },
  "metadata": {
    "operation": "get-standard-structure"
  },
  "warnings": []
}
```

## References

Traceability is a core contract feature, not optional metadata.

KASB examples:

- standard: `stdNum`, source URL
- section: `stdNum`, `indexDocumentId`, title, `ref`, source URL
- paragraph: `stdNum`, `paraNum`, `uniqueKey`, parent `indexDocumentId`, source URL

Without stable references, agents cannot verify, quote, or recover reliably.
