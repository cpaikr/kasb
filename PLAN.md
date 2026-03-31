# Plan

Current job: reverse engineer the KASB standards site request layer.

## Goal

Understand how `https://db.kasb.or.kr/standard/` actually fetches data so the next spec is based on observed requests, not guesses.

## In Scope

- capture search and retrieval flows from `https://db.kasb.or.kr/standard/`
- record methods, paths, query params, bodies, headers, cookies, and response types
- distinguish stable source identifiers from UI-only parameters

## Out Of Scope

- full tool implementation
- broad coverage beyond the standards source
- non-read flows

## Work Plan

1. Map the visible flows for search, standard detail, and paragraph retrieval.
2. Capture representative network traffic for those flows.
3. Record the request shapes that look reusable from outside the browser.
4. Summarize what appears stable enough to carry into the next spec step.

## Open Questions

- Does the site expose reproducible JSON or XHR endpoints for the core flows?
- Which cookies, tokens, or headers are required outside the browser?
- What identifiers are stable enough to support paragraph-level citation?
- Where does the site mix content data with presentation formatting?

## Exit Criteria

- at least one search or retrieval flow is captured clearly
- the key params, headers, and response shapes are recorded
- we can state the next spec step from evidence instead of guesswork
