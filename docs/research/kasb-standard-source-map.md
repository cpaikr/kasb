# KASB Standards Source Map

Captured on 2026-03-31. Q&A endpoint notes refreshed on 2026-05-17.

Status: observed source evidence, not the public contract or architecture guide. Promote stable contract decisions into [../specs/kasb-standards-v1.md](../specs/kasb-standards-v1.md) and implementation-shape decisions into [../../ARCHITECTURE.md](../../ARCHITECTURE.md).

Method:

- inspected the shipped frontend bundles under `https://db.kasb.or.kr/standard/`
- confirmed visible routes in a browser session
- replayed the read endpoints directly with `curl`

## API Origin

Observed:

- Browser routes live under `https://db.kasb.or.kr/standard/` and `https://db.kasb.or.kr/qnas/`.
- The current JSON API origin is `https://db.kasb.or.kr/api/`.
- Direct calls to `https://db.kasb.or.kr/standard/api/...` return the SPA HTML shell, not JSON.

Implementation implication:

- treat `/standard/` as the browser route base
- treat `/api/` as the read API base
- make KASB API URL construction a source-adapter concern under `sources/kasb/`

## UI Flow Map

Observed:

- Home: `/standard/`
- Search results: `/search?q=&searchWord={term}`
- Standard view: `/s/{stdNum}/{titleDocumentId}`

Observed route behavior:

- searching `리스` from the home page navigated to `/search?q=&searchWord=%EB%A6%AC%EC%8A%A4`
- opening `/s/1116/5?searchWord=%EB%A6%AC%EC%8A%A4` normalized to `/s/1116/19970f`

Implementation implication:

- browser routes are useful evidence but not the public v1 access path
- route-facing ids should not be accepted as section retrieval ids without a future explicit mapping operation

## Identifier Spaces

Observed:

- `stdNum`
  Stable standard identifier. Example: `1116`.
- `paraNum`
  Stable paragraph reference inside a standard. Examples: `23`, `한2.1`, `B3`, `BC240A`.
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

Important observed finding:

- `titleDocumentId` and `indexDocumentId` are not interchangeable.
- For `stdNum=1116`, `/api/standard/1116/first-document-id` returns `19970f`.
- For `stdNum=1116`, `/api/standard-indexes/1116/first-document-id` returns `ZB2hJW`.
- `/api/paragraphs/1116/19970f` returns empty clauses.
- `/api/paragraphs/1116/ZB2hJW` returns paragraphs `1` and `2`.

Current v1 decision:

- expose `indexDocumentId` directly for section retrieval
- keep `titleDocumentId` out of the public contract
- treat route ids as browser-facing only unless later evidence reveals a stable mapping worth supporting
- keep `bigSeq`, `midSeq`, `smallSeq`, and `littleSeq` internal source fields

## Request Inventory

### Search And Discovery

Observed endpoints:

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

v1 uses only the source surface needed for `search-standards` and optional search-filtered structure/section retrieval. Additional search endpoints should stay internal until a capability needs them.

### Standard Structure

Observed endpoints:

- `GET /api/standard/{stdNum}/first-document-id`
  First route-facing `titleDocumentId` for `/s/{stdNum}/{titleDocumentId}`.
- `GET /api/title/{stdNum}`
  Hierarchical title tree with `bigSeq`/`midSeq` fields and `titleDocumentId` values.
- `GET /api/title/{stdNum}/searchWord?searchWord={term}`
  Same title tree with search hit counts and selected flags.
- `GET /api/standard-indexes/{stdNum}`
  Flat structural index with `indexDocumentId`, `level`, `documentType`, and `parentDocumentIds`.
- `GET /api/standard-indexes/{stdNum}/searchWord?searchWord={term}`
  Search metadata for index nodes. Observed response shape contains `searchedUniqueKeys` and `searchedIndexCountMap`, not `standardIndexes[]`.
- `GET /api/standard-indexes/{stdNum}/first-document-id`
  First retrieval-facing `indexDocumentId`.
- `GET /api/standard-indexes/{stdNum}/html-type/{documentType}`
  Fetches typed docs such as overview or revision.

v1 public structure lookup should use `standard-indexes`, not `title` ids.

### Content Retrieval

Observed endpoints:

- `GET /api/paragraphs/{stdNum}/{indexDocumentId}?searchWord={term?}`
  Returns `clauses[]` plus `mainTitle` metadata. `clauses[]` may mix title rows and paragraph rows.
- `GET /api/paragraphs/content/{stdNum}/{paraNum}`
  Direct paragraph lookup by stable paragraph number.
- `GET /api/paragraphs/bookmarks/{stdNum}/{paraNum}`
  Bookmark-related paragraph lookup.

v1 public section retrieval should use `indexDocumentId`. v1 public paragraph retrieval should use `stdNum + paraNum`.

### Q&A Retrieval

Observed endpoints:

- `GET /api/qnas/v2/types`
  Returns Q&A type metadata. Observed public type ids include `11`, `12`, `13`, `14`, `15`, `24`, and `25`.
- `GET /api/qnas/v2/count`
  Returns Q&A counts by type.
- `GET /api/qnas/v2?types={csv}&searchWord={term}&page={page}&rows={rows}`
  Returns Q&A search results with `docNumber`, `type`, highlighted `title`, highlighted `fullContent`, tags, source links, and count metadata. Observed `facilityQnaCountData` values can be summed for `totalCount`; `totalPages` and `hasNextPage` are derived from `rows` and the requested page, with `paginationStatus` indicating whether complete count metadata was available.
- `GET /api/qnas/v2/{docNumber}?searchWord={term?}`
  Returns one Q&A document with `docNumber`, `type`, `title`, `fullContent`, optional `contentHtml`, related standards HTML, tags, adjacent document numbers, and similar Q&A references.
- `GET /api/qnas/v2/paragraph?faqDocNumbers={csv}`
  Appears to map paragraph FAQ document numbers to Q&A data.

Observed:

- Searching `리스` with `types=11,12,13,14,15,24,25&page=1&rows=5` returned `200 OK` and Q&A documents such as `IFRSIC2207E`, `2020-I-KQA002`, and `SSI-35629`.
- `GET /api/qnas/v2/SSI-35629?searchWord=리스` returned a full Q&A document for `리스 개시일과 계약일`.
- Calling legacy `GET /api/qnas?...` with the same search shape returned `500` during refresh; v1 implementation should use `/api/qnas/v2`.

Implementation implication:

- treat Q&A document identity as `docNumber`
- keep Q&A `type` values source-facing until product docs promote a stable semantic enum
- preserve source `contentHtml` and `relStds` as HTML fields when returned, with warnings
- use `/api/qnas/v2` for read-only Q&A search and detail retrieval

### Non-Read Noise To Ignore In V1

Observed endpoints:

- `POST /api/search/search-log`
  Analytics/logging only.
- `GET /api/standard/check-ip`
  Public gating check, observed as `{"status":200}`.

These do not belong in the public v1 contract.

## Response Notes

Observed response shapes:

- `/api/standard`
  Returns `standards.stdCountObj`, `standards.totalCount`, and `standards.stdCountArr`.
  Observed on 2026-05-20: `stdCountArr` is not relevance-ranked by `doc_count`. For example, `리스` returned K-IFRS `1116` at source rank 35 despite the highest count, `수익인식` returned `1115` at source rank 15 despite the highest count, and `충당부채` returned `1037`/general GAAP `14` at source ranks 21/41 while they were count ranks 1/2. Treat this as source/API order, not task-oriented ranking.
- `/api/title/{stdNum}`
  Returns nested `titles[]` with title text, `ref`, sequencing fields, and route-facing `documentId`.
- `/api/standard-indexes/{stdNum}`
  Returns `standardIndexes[]` as a flat graph with `parentDocumentIds`.
- `/api/standard-indexes/{stdNum}/searchWord?searchWord={term}`
  Returns `searchedUniqueKeys[]` plus `searchedIndexCountMap`, where keys are retrieval `indexDocumentId` values and the source may include a string `"null"` bucket for unmatched hits.
- `/api/paragraphs/{stdNum}/{indexDocumentId}`
  Returns `status`, `clauses`, `mainTitle`, `mainTitleLevel`, and `mainTitleSort`.
- `/api/paragraphs/content/{stdNum}/{paraNum}`
  Returns `paraContents[]` with both `paraContent` HTML and `fullContent` plain text.
- `/api/search/standard-indexes/{indexDocumentId}/paragraphs`
  Returns `highlightedUniqueKey[]` and `highlightedParagraphWord`.

Implementation implication:

- source response schemas should live under `src/sources/kasb/`
- public capability result schemas should expose normalized standards, sections, paragraphs, references, metadata, and warnings
- raw source payloads may be exposed only through explicit CLI debugging output, not the default public success result

## Browser Independence

Observed read-only replay worked directly from `curl` during this investigation:

- no cookie was required in tested calls
- no CSRF token was required in tested calls
- no special header beyond default `curl` behavior was required
- no redirect to login was observed

Implementation implication:

- the first core can use direct read-only HTTP requests
- add opt-in live checks later because public source behavior can change
- if auth or anti-bot behavior appears later, record it here before changing specs

## Example Evidence

Observed:

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

- `stdNum + paraNum` behaves as an exact paragraph reference across numeric, Korean-prefixed, appendix, and basis-for-conclusions paragraph forms in tested cases
- direct paragraph lookup also returns the parent retrieval `documentId`, so callers do not need to supply a section id to fetch one exact paragraph

## Promoted v1 Decisions

Promoted to [../specs/kasb-standards-v1.md](../specs/kasb-standards-v1.md):

- use public `keyword` for search text and map it to source `searchWord`
- use `stdNum` as the standard-level public id
- use `indexDocumentId` as the public section retrieval id
- use `paraNum` as the paragraph-level public reference
- define exact paragraph input as `stdNum + paraNum`
- return parent `indexDocumentId` as paragraph metadata when available
- keep `titleDocumentId` internal in v1
- do not expose `bigSeq`/`midSeq` as public ids unless later evidence proves they are stable
- return API URLs as the guaranteed source URL
