# Plan

Current job: reverse engineer the KASB standards site request layer for the active investigation.

## Goal

Produce enough evidence about the upstream site to define a real read-only tool contract without guessing.

## In Scope

- capture search and retrieval flows from `https://db.kasb.or.kr/standard/`
- record methods, paths, query params, bodies, headers, cookies, and response types
- distinguish stable source identifiers from UI-only parameters
- validate candidate read operations outside the browser
- store detailed evidence in `plans/kasb-standards-source-investigation.md`

## Out Of Scope

- final implementation of the tool
- a full public API contract for every upstream endpoint
- write or account-related flows
- broad coverage beyond the standards source

## Work Plan

1. Map the visible flows for search, standard detail, and paragraph retrieval.
2. Capture representative network traffic for those flows.
3. Record observed request and response shapes, marking observation versus inference.
4. Replay promising requests with `curl` or a small script.
5. Summarize the stable read surface, constraints, and remaining gaps.

## Open Questions

- Does the site expose reproducible JSON or XHR endpoints for the core flows?
- Which cookies, tokens, or headers are required outside the browser?
- What identifiers are stable enough to support paragraph-level citation?
- Where does the site mix content data with presentation formatting?

## Exit Criteria

- at least one search flow is reproduced outside the browser
- at least one direct retrieval flow is reproduced outside the browser
- core params, headers, and response shapes are captured for those flows
- stable versus fragile upstream fields are identified well enough to draft the spec
