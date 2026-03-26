# Contracts

## Goal

A tool contract should make invalid usage hard and useful usage obvious.

This document covers single-tool interface design. For conventions shared across many tools, see [portfolio.md](portfolio.md).

## Input Design

Prefer inputs that are:

- `semantic`
  Use fields like `company_name`, `report_type`, `date_range`, `sheet_name`, or `page_window` instead of one overloaded free-form string.
- `bounded`
  Include scope, limits, offsets, and modes.
- `composable`
  Support filtering and pagination instead of one monolithic request.
- `safe`
  Separate read-only operations from mutating or destructive ones.

Avoid:

- catch-all `query` parameters when a structured form exists,
- mode switches that completely change the result shape,
- hidden defaults that affect correctness,
- raw text prompts as the primary interface for deterministic work.

## Output Design

Most tools benefit from a consistent outer envelope:

- `result`
  The structured payload the next step consumes.
- `metadata`
  Source, timing, version, partial flags, cache info.
- `references`
  Page numbers, cell ranges, urls, filing ids, paths.
- `warnings`
  Partial parse, low confidence, missing pages, fallbacks.
- `error`
  Typed code, message, retryability, suggested next action.

Keep the envelope consistent. Let the domain payload vary by tool family.

## Output Modes

Many tools should expose:

- `summary`
  Small, agent-readable synthesis
- `structured`
  Schema-first payload for downstream steps
- `raw`
  Original text, html, cells, or fragments when needed

This avoids the false choice between "too abstract" and "too verbose."

## Error Model

Treat errors as part of the product.

Useful error categories:

- `invalid_input`
- `not_found`
- `unauthorized`
- `rate_limited`
- `source_unavailable`
- `source_changed`
- `partial_extraction`
- `unsafe_operation`
- `internal_failure`

Each error should say:

- whether retrying may help,
- whether the input should change,
- whether the upstream source changed,
- what fallback path exists.

## References

Traceability is a core contract feature, not optional metadata.

Examples:

- PDF: `page`, `block_id`, `bbox`
- Excel: `sheet`, `cell_range`, `header_rows`
- filing search: `filing_id`, `document_id`, `section_id`, `submitted_at`
- filesystem: `path`, `relative_path`, `operation_id`

Without stable references, agents cannot verify, quote, or recover reliably.
