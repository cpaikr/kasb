# Architecture

This repo is no longer docs-only. The target system has two implementation tracks:

- a reusable KASB access tool that queries `https://db.kasb.or.kr/api/` with typed operations
- a scraper that uses that tool to collect standards data and persist it to a database

The docs still matter, but they now support implementation instead of standing in for it.

## Start Here

1. Read [README.md](README.md) for repo orientation.
2. Read [VISION.md](VISION.md) for product scope.
3. Read [docs/specs/kasb-standards-v1.md](docs/specs/kasb-standards-v1.md) for the current contract target.
4. Read [PRMOPT.md](PRMOPT.md) for the active implementation discussion about stack, tooling, and viable build paths.

## Target Shape

The intended root layout is:

- `packages/kasb-tool/`
  Reusable read-only KASB client, domain types, normalization, and CLI entry points.
- `apps/kasb-scraper/`
  Scraping jobs that call `kasb-tool`, decide crawl scope, and persist normalized records.
- `db/`
  Schema, migrations, and database bootstrap for scraper persistence.
- `docs/specs/`
  Stable capability specs that the tool implementation must satisfy.
- `docs/research/`
  Source investigation notes and upstream evidence.

If the exact directory names change, preserve the same split: reusable tool core first, scraper second, persistence as a separate seam.

## Component Map

### `kasb-tool`

Owns:

- the base API client for `https://db.kasb.or.kr/api/`
- typed operations such as standard search, structure lookup, section retrieval, and paragraph retrieval
- identifier handling for `stdNum`, `indexDocumentId`, `paraNum`, and `uniqueKey`
- response normalization and typed errors
- fixture-backed tests
- a CLI or scriptable adapter for local verification

Does not own:

- crawl scheduling
- persistence policy
- long-running sync state

### `kasb-scraper`

Owns:

- choosing what to scrape and in what order
- calling `kasb-tool` repeatedly without re-implementing API rules
- persistence into the project database
- resumability, deduplication, and scrape bookkeeping
- refresh or backfill jobs

Does not own:

- raw upstream contract knowledge that already belongs in `kasb-tool`
- ad hoc API calls that bypass the shared client

### Database Layer

Owns:

- normalized storage for standards, sections, paragraphs, and scrape runs
- migration history
- persistence utilities used by the scraper

The database is a scraper concern, not a tool concern. The tool returns structured results; the scraper decides what to store and how to model crawl state.

## Runtime Flow

The main flow should be:

1. `kasb-tool` sends typed read-only requests to the live KASB API.
2. `kasb-tool` validates and normalizes upstream payloads into stable domain objects.
3. `kasb-scraper` uses those operations to traverse standards, sections, and paragraphs.
4. `kasb-scraper` writes normalized records and scrape metadata to the database.
5. Downstream analysis or export work reads from the database instead of hitting KASB directly.

That split keeps source-specific logic in one place and prevents the scraper from turning into a second undocumented client.

## Document Ownership

- [README.md](README.md)
  Repo orientation and reading order.
- [VISION.md](VISION.md)
  Product goal, scope, and non-goals.
- [ROADMAP.md](ROADMAP.md)
  Strategic sequencing.
- [TODO.md](TODO.md)
  Ordered near-term queue.
- [PLAN.md](PLAN.md)
  The one active detailed plan.
- [PRMOPT.md](PRMOPT.md)
  Active discussion brief for implementation choices, viable stacks, and build strategy.
- [docs/specs/](docs/specs/)
  Stable capability specs for the tool and related implementation targets.
- [docs/research/](docs/research/)
  Source evidence and upstream investigation notes.
- [docs/tools/](docs/tools/)
  Cross-cutting design guidance for agent-facing tools.

## Invariants

- Keep the KASB API contract in one reusable tool module. Do not duplicate request logic inside the scraper.
- Treat `indexDocumentId` as the v1 public section id and keep `titleDocumentId` internal unless the contract changes explicitly.
- Keep scraping policy separate from retrieval logic. The tool fetches; the scraper decides traversal and persistence.
- Keep database writes out of the core tool module.
- Keep stable specs in [docs/specs/](docs/specs/); keep upstream investigation in [docs/research/](docs/research/).
- Prefer one shared typed language boundary between the tool, scraper, and CLI unless a stronger reason justifies a split stack.

## Near-Term Direction

The next implementation milestone is:

- create the first `kasb-tool` module
- capture fixtures for the v1 operations
- define the scraper-facing database schema
- build the first `kasb-scraper` job on top of the shared tool
