# PRMOPT

This file is the working brief for implementation discussion.

The repo now needs two real deliverables:

- a KASB tool module that can query the live KASB API effectively with code
- a scraper module that uses that tool and persists retrievable data into a database

This document is for choosing how to build that system, not for storing final architecture forever. Once decisions are stable, promote them into specs, architecture docs, and code.

## What We Need To Build

### 1. KASB Tool

The tool should:

- talk directly to `https://db.kasb.or.kr/api/`
- expose typed operations around search, structure lookup, section retrieval, and paragraph retrieval
- normalize upstream responses
- surface typed errors around invalid ids, empty section lookups, upstream drift, and unavailable source states
- support local scripted use, ideally through a CLI

### 2. Scraper

The scraper should:

- depend on the tool instead of making raw HTTP calls
- iterate standards, sections, and paragraphs in a controlled order
- persist normalized data into a database
- track scrape runs, failures, retries, and refresh state

## Decision Criteria

Any implementation choice should be judged by:

- how quickly we can ship the first reliable read-only client
- how easy it is to keep the tool and scraper in one coherent system
- typing quality around ids and result shapes
- fixture-backed testing
- CLI ergonomics
- database integration quality
- future MCP or SDK reuse without rewriting the core

## Viable Build Options

### Option A: TypeScript + Bun + SQLite first

Shape:

- `packages/kasb-tool` in TypeScript
- `apps/kasb-scraper` in TypeScript
- `bun` for runtime, package management, and scripts
- SQLite for first persistence and local iteration

Gains:

- one language across tool, scraper, and future adapters
- strong type boundaries for `stdNum`, `indexDocumentId`, and `paraNum`
- simple `fetch` support and good CLI ergonomics
- aligns with the repo preference for `bun`
- easiest path to a reusable JS/TS SDK and later MCP wrapper

Losses:

- less mature scraping/data ecosystem than Python in some areas
- some database libraries still assume Node compatibility details
- SQLite may need migration later if we outgrow local-first persistence

### Option B: Python + SQLite or Postgres

Shape:

- `kasb_tool/` in Python
- `scraper/` in Python
- `uv` or `poetry` for packaging
- SQLite first or Postgres from the start

Gains:

- strong ecosystem for scraping, ETL, and data workflows
- straightforward scripting
- mature ORM and migration options

Losses:

- splits the implementation language from the repo’s current package-tooling preference
- weaker path to reuse in JS-heavy agent runtimes
- likely higher friction if we later want CLI, SDK, and MCP packaging in one stack

### Option C: Split stack

Shape:

- tool in TypeScript
- scraper in Python
- shared contract through HTTP, JSON files, or duplicated schemas

Gains:

- each side uses a locally optimal language

Losses:

- duplicated types or codegen burden
- slower iteration
- higher maintenance cost
- easy for the scraper to drift from the tool contract

This should be avoided unless a concrete requirement forces it.

## Recommendation

Start with:

- TypeScript
- `bun`
- one repo-local implementation
- SQLite first

Why:

- the current problem is contract-heavy, not browser-heavy
- the live KASB API is already usable directly
- the tool and scraper share the same domain model
- the repo wants a reusable tool first and a scraper built on top of it
- SQLite is enough for the first crawl and easiest for fixtures, local development, and inspection

## Recommended Initial Layout

```text
packages/
  kasb-tool/
    src/
    test/
    fixtures/
apps/
  kasb-scraper/
    src/
    test/
db/
  migrations/
  schema/
```

## Recommended Early Libraries To Inspect

These are candidates, not fixed decisions:

- HTTP/runtime:
  native `fetch` in Bun
- CLI:
  small custom CLI first, or `commander`
- validation:
  `zod` if runtime validation proves necessary
- database:
  `drizzle` with SQLite, or a thinner SQL-first layer if we want less abstraction
- testing:
  Bun test runner first unless we hit a concrete limitation

## Questions To Discuss Before Scaffolding

1. Do we want SQLite only for the first scraper milestone, or do you already expect a shared Postgres-backed dataset?
2. Should the first scraper persist raw upstream payloads alongside normalized rows, or only normalized records plus scrape metadata?
3. Do you want the first CLI to be developer-facing only, or should we design it immediately as a stable user-facing interface?
4. Should the scraper aim for full-corpus backfill first, or start with one standard and one traversal path as the proving slice?

## Proposed Next Step

If we accept the recommendation above, the next implementation step is:

1. scaffold `packages/kasb-tool`
2. scaffold `apps/kasb-scraper`
3. choose SQLite schema boundaries
4. capture fixtures from the live API
5. implement the first typed read-only client
