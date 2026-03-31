# Plan

Current job: bootstrap the first read-only implementation slice from the v1 spec.

## Goal

Turn `docs/specs/kasb-standards-v1.md` into an implementation-ready layout with the first typed core surface defined.

## Deliverable

- a chosen code layout for the reusable core, fixtures, and CLI adapter
- a first fixture set for the four v1 operations
- the initial typed client and domain model boundary for `search_standards`, `get_standard_structure`, `get_section`, and `get_paragraph`

## Decisions

- implement in this repo with `packages/kasb-tool` and `apps/kasb-scraper`
- use SQLite for the first scraper milestone
- persist normalized records as the primary product
- also persist selected raw upstream JSON payloads plus scrape metadata for debugging, drift detection, and re-normalization
- start raw payload capture with the core retrieval endpoints, not every possible endpoint

## In Scope

- create the repo-local implementation split between the shared tool and scraper
- define the first package or module boundaries
- capture stable fixture examples from the live `/api/` surface
- define the typed shapes needed for the v1 operations
- start the read-only core before any MCP or browser-facing adapter work

## Out Of Scope

- MCP adapter work
- auth, write flows, or accounts
- caching, persistence, or background sync
- broad source normalization beyond the v1 spec

## Inputs

- `docs/specs/kasb-standards-v1.md`
- `docs/research/kasb-standard-source-map.md`
- `docs/tools/contracts.md`
- `ARCHITECTURE.md`
- `PRMOPT.md`

## Work Plan

1. Scaffold the repo-local package layout for `kasb-tool` and `kasb-scraper`.
2. Define the SQLite schema for normalized records, `scrape_runs`, and raw payload storage.
3. Capture the smallest useful fixture corpus for search, structure, section, and paragraph retrieval.
4. Define the typed result envelope and domain entities from the spec.
5. Implement the read-only HTTP client against `https://db.kasb.or.kr/api/`.
6. Add focused tests around the known identifier pitfalls, especially route ids versus retrieval ids.

## Exit Criteria

- the repo has a clear implementation location and package split
- the first SQLite schema covers normalized records, scrape metadata, and selected raw payloads
- fixture-backed work can begin without reopening the identifier investigation
- the first core module boundary is clear enough to start coding without revisiting the contract
