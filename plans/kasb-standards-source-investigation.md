# KASB Standards Source Investigation Plan

## Scope

This is an investigation plan, not a product spec.

Its job is to define how we learn the source, what evidence to collect, and which artifacts should exist before writing the v1 spec.

## Why This Comes First

Before writing a detailed tool spec, we need to know how the source actually works.

Questions that block a real spec:

- what search and navigation requests the site makes
- which endpoints are public and stable
- which identifiers represent standards, sections, and paragraphs
- whether retrieval is API-first, HTML-first, or hybrid
- what rate limits, anti-bot behavior, or terms constraints exist

Without that knowledge, the public tool contract would be guesswork.

The vision is in [../VISION.md](../VISION.md). This document exists to turn that vision into evidence-backed design inputs.

## Investigation Principles

- prefer observing real browser behavior before assuming API design
- distinguish direct observation from inference
- capture exact request and response shapes
- treat rate limits, access controls, and terms of use as product constraints
- optimize for repeatable notes, fixtures, and transcripts

## Phased Plan

### Phase 1: Surface Mapping

Goal: understand the visible product shape before touching network details.

Tasks:

- map the major user flows for search, standard navigation, and paragraph viewing
- list visible entities such as standards, sections, paragraphs, and related materials
- identify which flows appear public versus gated

Deliverable:

- a short site map and terminology map

### Phase 2: Browser Traffic Capture

Goal: observe the actual requests used by the site.

Tasks:

- capture network traffic while performing representative actions
- record request method, path, params, headers, and response type
- group requests by capability: search, titles, clause fetch, related references, metadata

Deliverable:

- a request inventory with example inputs and outputs

### Phase 3: Replay Outside The Browser

Goal: confirm which requests can be reproduced programmatically.

Tasks:

- replay candidate requests with `curl` or small scripts
- test whether cookies, tokens, or special headers are required
- verify which endpoints are safe for public, read-only use

Deliverable:

- a validated list of reproducible read operations

### Phase 4: Domain Model Extraction

Goal: derive a stable internal model from the upstream responses.

Tasks:

- identify standard ids, paragraph ids, document ids, and section hierarchy
- define how citations should be represented
- note fields that are unstable, presentation-only, or redundant

Deliverable:

- an entity and reference model for the future tool

### Phase 5: Reliability And Policy Check

Goal: learn whether the source is durable enough for a reusable tool.

Tasks:

- test multiple queries and standards for response consistency
- look for pagination, hidden limits, missing data, and source drift
- review robots, terms, and practical request-budget constraints

Deliverable:

- a risk register and operating constraints

### Phase 6: Spec Drafting

Goal: turn the investigation into an implementation-ready tool spec.

Tasks:

- choose the minimal operation set for v1
- define request and response schemas
- define errors, warnings, and output modes
- decide what belongs in the core versus adapters

Deliverable:

- a detailed tool spec built from evidence, not assumptions

## Initial Roadmap

1. Complete Phases 1 and 2 with captured evidence.
2. Confirm a small public read-only API surface in Phase 3.
3. Define the domain model and citations in Phase 4.
4. Decide whether the first implementation is API-only or API plus HTML fallback.
5. Write the detailed v1 tool spec.
6. Implement a local CLI first.
7. Add tests and scenario evals.
8. Add an MCP adapter only after the core contract is stable.

## Expected Artifacts

- `docs/specs/kasb-standards-source-map.md`
  site map and entity glossary
- `docs/specs/kasb-standards-request-inventory.md`
  observed requests and responses
- `docs/specs/kasb-standards-domain-model.md`
  stable ids, entities, and references
- `docs/specs/kasb-standards-tool-v1.md`
  implementation-ready spec

## Risks To Watch

- undocumented upstream changes
- hidden auth or anti-automation constraints
- unstable identifiers tied to UI structure
- HTML fields that mix display formatting with content
- terms or operational limits that make aggressive scraping unacceptable

## Exit Criteria For The Investigation

Do not move into implementation until the following are true:

- at least one search flow is reproducible outside the browser
- at least one direct retrieval flow is reproducible outside the browser
- standard and paragraph references are understood well enough to cite
- the v1 operation set can be defined without guessing
- the expected request volume appears operationally safe
