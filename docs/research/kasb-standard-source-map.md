# KASB Standards Source Map

Captured on 2026-03-31.

Method:

- inspected the shipped frontend bundles under `https://db.kasb.or.kr/standard/`
- confirmed visible routes in a browser session
- replayed the read endpoints directly with `curl`

This document records source evidence for the KASB standards site. It is not yet the public tool spec.

## API Origin

- Browser routes live under `https://db.kasb.or.kr/standard/`.
- The current JSON API origin is `https://db.kasb.or.kr/api/`.
- Direct calls to `https://db.kasb.or.kr/standard/api/...` return the SPA HTML shell, not JSON.

Implementation note:

- treat `/standard/` as the browser route base
- treat `/api/` as the read API base

## UI Flow Map

- Home: `/standard/`
- Search results: `/search?q=&searchWord={term}`
- Standard view: `/s/{stdNum}/{titleDocumentId}`

Observed route behavior:

- searching `리스` from the home page navigated to `/search?q=&searchWord=%EB%A6%AC%EC%8A%A4`
- opening `/s/1116/5?searchWord=%EB%A6%AC%EC%8A%A4` normalized to `/s/1116/19970f`

## Identifier Spaces

- `stdNum`
  Stable standard identifier. Example: `1116`.
- `paraNum`
  Stable paragraph reference inside a standard. Example: `23`, `한2.1`, `BC240A`.
- `uniqueKey`
  Paragraph key returned by the API as `{stdNum}-{paraNum}`. Example: `1116-23`.
- `titleDocumentId`
  Route-facing document id returned by `/api/title/{stdNum}` and `/api/standard/{stdNum}/first-document-id`.
- `indexDocumentId`
  Retrieval-facing document id returned by `/api/standard-indexes/{stdNum}` and `/api/standard-indexes/{stdNum}/first-document-id`.
- `documentType`
  Non-body document classification such as `overview`, `revision`, `relationship`, `other`.
- `bigSeq`, `midSeq`, `smallSeq`, `littleSeq`
  Tree-ordering fields still present in title data. They look like UI sequencing, not stable public ids.

Important finding:

- `titleDocumentId` and `indexDocumentId` are not interchangeable.
- For `stdNum=1116`, `/api/standard/1116/first-document-id` returns `19970f`.
- For `stdNum=1116`, `/api/standard-indexes/1116/first-document-id` returns `ZB2hJW`.
- `/api/paragraphs/1116/19970f` returns empty clauses.
- `/api/paragraphs/1116/ZB2hJW` returns paragraphs `1` and `2`.

That mismatch is the main identifier risk to settle before writing the tool contract.

Current decision for v1:

- expose `indexDocumentId` directly for section retrieval
- keep `titleDocumentId` out of the public contract
- treat route ids as browser-facing only unless later evidence reveals a stable mapping worth supporting

## Request Inventory

### Search And Discovery

- `GET /api/standard?searchWord={term}`
  Standard-level search counts by `stdNum`.
- `GET /api/search/search-basic`
  Returns top searched words.
- `GET /api/search/auto-complete/searchWord?searchWord={term}`
  Search autocomplete.
- `GET /api/search/tags?q={term}`
  Search-related tags.
- `GET /api/search/total/count?searchWord={term}`
  Cross-site aggregate counts.
- `GET /api/search/total/paragraphs?searchWord={term}&stdNum={stdNum}`
  Paragraph hits within one standard.
- `GET /api/search/standard-indexes/count?stdNum={stdNum}&searchWord={term}`
  Match counts per `indexDocumentId`.
- `GET /api/search/standard-indexes/{indexDocumentId}/paragraphs?stdNum={stdNum}&searchWord={term}`
  Highlight metadata for matched paragraphs under one index node.

### Standard Structure

- `GET /api/standard/{stdNum}/first-document-id`
  First route-facing `titleDocumentId` for `/s/{stdNum}/{titleDocumentId}`.
- `GET /api/title/{stdNum}`
  Hierarchical title tree with `bigSeq`/`midSeq` fields and `titleDocumentId` values.
- `GET /api/title/{stdNum}/searchWord?searchWord={term}`
  Same title tree with search hit counts and selected flags.
- `GET /api/standard-indexes/{stdNum}`
  Flat structural index with `indexDocumentId`, `level`, `documentType`, and `parentDocumentIds`.
- `GET /api/standard-indexes/{stdNum}/searchWord?searchWord={term}`
  Search-filtered index tree.
- `GET /api/standard-indexes/{stdNum}/first-document-id`
  First retrieval-facing `indexDocumentId`.
- `GET /api/standard-indexes/{stdNum}/html-type/{documentType}`
  Fetches typed docs such as overview or revision.

### Content Retrieval

- `GET /api/paragraphs/{stdNum}/{indexDocumentId}?searchWord={term?}`
  Returns `clauses[]` plus `mainTitle` metadata. `clauses[]` may mix title rows and paragraph rows.
- `GET /api/paragraphs/content/{stdNum}/{paraNum}`
  Direct paragraph lookup by stable paragraph number.
- `GET /api/paragraphs/bookmarks/{stdNum}/{paraNum}`
  Bookmark-related paragraph lookup.

### Non-Read Noise To Ignore In V1

- `POST /api/search/search-log`
  Analytics/logging only.
- `GET /api/standard/check-ip`
  Public gating check, currently returns `{"status":200}`.

## Response Notes

- `/api/standard`
  Returns `standards.stdCountObj`, `standards.totalCount`, and `standards.stdCountArr`.
- `/api/title/{stdNum}`
  Returns nested `titles[]` with title text, `ref`, sequencing fields, and route-facing `documentId`.
- `/api/standard-indexes/{stdNum}`
  Returns `standardIndexes[]` as a flat graph with `parentDocumentIds`.
- `/api/paragraphs/{stdNum}/{indexDocumentId}`
  Returns `status`, `clauses`, `mainTitle`, `mainTitleLevel`, and `mainTitleSort`.
- `/api/paragraphs/content/{stdNum}/{paraNum}`
  Returns `paraContents[]` with both `paraContent` HTML and `fullContent` plain text.
- `/api/search/standard-indexes/{indexDocumentId}/paragraphs`
  Returns `highlightedUniqueKey[]` and `highlightedParagraphWord`.

## Browser Independence

Read-only replay worked directly from `curl` in this investigation:

- no cookie was required in tested calls
- no CSRF token was required in tested calls
- no special header beyond default `curl` behavior was required
- no redirect to login was observed

This is evidence for a public read-only core, but it is still worth rechecking if the site changes.

## Example Evidence

- `GET /api/standard?searchWord=리스`
  Returned `200 OK` and `totalCount: 1043`.
- `GET /api/paragraphs/content/1116/23`
  Returned paragraph `23` with `uniqueKey: "1116-23"` and `documentId: "bdbwhT"`.
- `GET /api/paragraphs/content/1116/한2.1`
  Returned one paragraph with `uniqueKey: "1116-한2.1"` and `documentId: "fgc8eT"`.
- `GET /api/paragraphs/content/1116/B3`
  Returned one paragraph with `uniqueKey: "1116-B3"` and `documentId: "M12hre"`.
- `GET /api/paragraphs/content/1116/BC240A`
  Returned one paragraph with `uniqueKey: "1116-BC240A"` and `documentId: "ITKVjD"`.
- `GET /api/paragraphs/1116/ZB2hJW`
  Returned the `목적` section with paragraphs `1` and `2`.

Observed implication:

- `stdNum + paraNum` currently behaves as an exact paragraph reference across numeric, Korean-prefixed, appendix, and basis-for-conclusions paragraph forms.
- direct paragraph lookup also returns the parent retrieval `documentId`, so callers do not need to supply a section id to fetch one exact paragraph.

## Implications For The Next Spec Step

- Use `stdNum` as the standard-level public id.
- Use `paraNum` as the paragraph-level public reference.
- Treat `indexDocumentId` as the current retrieval key for section-level fetches.
- Define the v1 exact paragraph input as `stdNum + paraNum`; return the parent `indexDocumentId` as metadata.
- Do not expose `bigSeq`/`midSeq` as public ids unless later evidence proves they are stable.
- Keep `titleDocumentId` internal to routing in v1.
