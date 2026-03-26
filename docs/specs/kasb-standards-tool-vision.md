# KASB Standards Tool Vision

## Identity

- `name`
  `kasb-standards`
- `status`
  vision
- `domain`
  Korean accounting standards and related interpretation material
- `users`
  LLM agents, agent developers, and researchers who need reliable access to KASB standards content

## Goal

Build a tool that gives LLM agents a stable, programmatic way to search and retrieve Korean accounting standards from `https://db.kasb.or.kr/standard/`.

The target developer experience is closer to `yfinance` than to browser automation:

- small, semantic operations
- predictable structured results
- stable identifiers and references
- easy local scripting for humans
- easy wrapping for MCP later

## Problem

Generic web browsing is a weak interface for standards research.

- agents spend too many steps navigating pages and search screens
- answers are harder to verify without stable paragraph references
- repeated lookups are slow and brittle
- unstructured HTML forces the model to infer document structure

This capability is worth standardizing because standards research is repetitive, citation-sensitive, and benefits from deterministic retrieval.

## Product Shape

The tool should eventually expose a small set of agent-facing capabilities:

- search standards by keyword
- list standards or sections that match a query
- fetch standard metadata
- fetch paragraphs or clauses with stable references
- follow internal references between standards and paragraphs
- return raw source text plus cleaned structured text

## Design Principles

- `reference first`
  Every returned item should include enough information to cite and revisit the source.
- `search is not enough`
  The tool should support both discovery and direct retrieval.
- `structured over prose`
  Return typed records, not explanation text.
- `transport-light`
  Start with a reusable core and a CLI. Add MCP later if it materially improves agent integration.
- `public-read focus`
  The first version should target read-only access to public standards content.

## Desired Output Shape

Each operation should eventually converge on a common envelope:

- `result`
  domain payload for the operation
- `metadata`
  source, timing, version, and completeness notes
- `references`
  standard numbers, paragraph numbers, section path, source URL
- `warnings`
  partial matches, parsing uncertainty, source drift
- `error`
  typed failure with retry and fallback hints

## Non-Goals For The First Version

- legal interpretation or accounting advice
- free-form answer generation inside the tool
- mutation, posting, or account features
- complete support for every KASB-adjacent site on day one
- premature abstraction over many unrelated regulatory sources

## Likely Future Surfaces

- `Python package`
  For an experience similar to `yfinance`
- `CLI`
  For manual inspection, testing, and piping
- `MCP adapter`
  For direct tool use by agent hosts

## Success Criteria

The tool is successful when an agent can reliably do work such as:

- find the Korean standard most relevant to a concept
- retrieve the exact paragraph discussing that concept
- cite the standard and paragraph number in the answer
- compare multiple related paragraphs with low tool-call overhead

## Open Questions

- what stable identifiers the upstream site truly exposes
- whether public JSON endpoints are sufficient for all needed retrieval
- how much normalization is needed for titles, clauses, and examples
- whether related interpretation materials should be included in v1 or later
