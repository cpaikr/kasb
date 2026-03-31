# Roadmap

Recommendation: move from source investigation to a narrow, evidence-backed KASB standards access tool. Keep the first release read-only and citation-focused.

## Phase 1: Source Investigation

Deliverables:

- request inventory for search and retrieval flows
- validated read operations reproducible outside the browser
- source constraints: auth, rate limits, anti-bot behavior, and terms notes

## Phase 2: Capability Spec

Deliverables:

- stable domain model for standards, sections, paragraphs, and references
- v1 operation set shaped around agent tasks, not UI flows
- request, response, warning, and error schemas

## Phase 3: Core Implementation

Deliverables:

- reusable read-only core against the validated source surface
- local CLI for human and script use
- fixture-backed tests for key search and retrieval scenarios

## Phase 4: Hardening And Adapters

Deliverables:

- scenario evals for citation and retrieval quality
- operational notes for source drift and incomplete results
- MCP adapter only after the core contract is stable

## Intentional Deferrals

- broad multi-source abstraction
- mutation or account flows
- legal or accounting interpretation features
