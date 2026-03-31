# KASB Standards Vision

## Product

- `name`: `kasb-standards`
- `status`: vision
- `domain`: Korean accounting standards and related interpretation material
- `users`: LLM agents, agent developers, and researchers who need reliable access to standards content

## Goal

Build a reusable capability that gives agents and scraper jobs a stable, programmatic way to search and retrieve Korean accounting standards from KASB.

The target experience should be closer to `yfinance` than browser automation:

- small semantic operations
- predictable structured results
- stable identifiers and references
- easy local scripting for humans
- easy wrapping for MCP later

## Why This Exists

Generic browsing is a poor interface for standards research:

- agents spend too many steps navigating UI flows
- answers are harder to verify without stable paragraph references
- repeated lookups are slow and brittle
- unstructured HTML forces the model to infer document structure

This is worth standardizing because standards work is repetitive, citation-sensitive, and benefits from deterministic retrieval.

## Product Shape

The product should eventually support a narrow set of agent-facing capabilities:

- search standards by keyword
- list standards or sections that match a query
- fetch standard metadata
- fetch paragraphs or clauses with stable references
- follow internal references between standards and paragraphs
- return raw source text plus cleaned structured text

## Principles

- `reference first`: every returned item should be easy to cite and revisit
- `discovery and retrieval`: search alone is not enough
- `structured over prose`: return typed records, not generated explanations
- `transport-light`: start with a reusable core and a CLI; add MCP later if justified
- `public-read first`: v1 should target read-only access to public content

## v1 Boundaries

### In Scope

- read-only access to public standards content
- stable references to standards, sections, and paragraphs where possible
- enough metadata to verify origin, completeness, and source URL
- a core capability that can back a CLI, scraper jobs, and later SDK or MCP adapters

### Out Of Scope

- legal interpretation or accounting advice
- answer generation inside the tool
- mutation, posting, or account features
- broad coverage of unrelated regulatory sources
- premature multi-source abstraction

## Expected Output Shape

Operations should converge on a shared envelope with:

- `result`: operation payload
- `metadata`: source, timing, version, completeness notes
- `references`: standard number, paragraph number, section path, source URL
- `warnings`: partial matches, parsing uncertainty, source drift
- `error`: typed failure with retry or fallback hints

## Success Criteria

The product is successful when an agent can reliably:

- find the standard most relevant to a concept
- retrieve the exact paragraph discussing that concept
- cite the standard and paragraph number in its answer
- compare related paragraphs with low tool-call overhead

## Current State

The identifier model and public-read API surface are now established enough to support implementation:

- the reusable v1 contract lives in [docs/specs/kasb-standards-v1.md](docs/specs/kasb-standards-v1.md)
- the active implementation split between the shared tool and scraper lives in [ARCHITECTURE.md](ARCHITECTURE.md)
- the current implementation work is tracked in [PLAN.md](PLAN.md)

## Remaining Product Questions

These are not blockers for the first implementation slice:

- how much normalization titles, clauses, and examples need beyond the v1 contract
- whether interpretation materials belong in v1 or a later phase
- how far the first scraper should go beyond the core standards corpus
