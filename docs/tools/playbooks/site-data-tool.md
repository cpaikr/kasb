# Site Data Tool Playbook

Use [../contracts.md](../contracts.md) for shared contract rules and [../evaluation.md](../evaluation.md) for eval structure. This playbook is reference material for domain-access design, not a roadmap beyond the current CLI-only KASB standards product.

## Goal

When a target site has underlying APIs or stable request patterns, do not make agents browse it like humans. Build a domain access tool instead.

Examples:

- `https://db.kasb.or.kr/` for the current KASB standards source surface
- `https://dart.fss.or.kr/` as the sibling design reference in `../darty`

## Recommended Design Sequence

1. `Investigate the source`
   Reverse engineer network calls, request parameters, response payloads, pagination, auth, anti-bot behavior, identifier schemes, and update cadence.
2. `Define the domain model`
   Model stable concepts such as standard, section, paragraph, source URL, effective date, and revision.
3. `Define capability operations`
   Expose semantic operations instead of UI-driven flows.
4. `Package for agents`
   Return concise summaries plus structured references rather than raw HTML or unbounded JSON.

## Current KASB Operations

- `search-standards`
- `get-standard-structure`
- `get-section`
- `get-paragraph`

## What To Avoid

- exposing only a generic `search(query)` endpoint
- leaking fragile UI parameters into the public contract without justification
- returning raw HTML fragments when a cleaner domain object is possible
- forcing the agent to discover or traverse pagination manually when the tool can provide a semantic page or cursor contract
- letting CLI command code duplicate source requests that belong in the reusable tool

## Hard Cases

- undocumented parameters
- mixed browser route and API identifier spaces
- source ids that look interchangeable but are not, such as `titleDocumentId` and `indexDocumentId`
- source-side terminology drift
- public source behavior changes
- rate limits or anti-bot behavior
- historical standards, amendments, or interpretation materials that may need separate specs
