# KASB source-adapter profile

Status: normative language-neutral wire interpretation profile

This profile complements [OpenAPI](openapi.yaml). OpenAPI owns the supported
HTTP paths, parameters, and JSON envelope shapes; this document owns only
cross-response and decoding rules that OpenAPI cannot express. Public product
semantics remain in
[the KASB standards v1 specification](../../docs/specs/kasb-standards-v1.md).

## Request serialization

- Encode every path identifier as one independent UTF-8 percent-encoded path
  segment. Embedded `/`, query delimiters, spaces, and control characters must
  never change the route shape.
- Encode query values with URLSearchParams-compatible form encoding. Preserve
  the operation's parameter order because source URLs are public metadata:
  `types`, `searchWord`, `page`, `rows` for Q&A search; otherwise the order in
  OpenAPI.
- Omit optional query parameters rather than serializing empty or undefined
  values.
- Send no request body. Reuse one session-scoped client so cookies, connection
  pooling, proxy affinity, and the concurrency budget remain coherent.
- Make no automatic replay. One logical KASB request produces at most one HTTP
  attempt; retry policy belongs to callers after a typed failure.

## Identifier and identity rules

- Normalize source identifier scalars from finite JSON numbers or strings to
  the same JavaScript-compatible string representation. Do not promote source
  ordering fields or browser-facing title ids into public identifiers.
- A paragraph response must match the requested `stdNum` and `paraNum`, and its
  `uniqueKey` must equal `{stdNum}-{paraNum}`.
- A Q&A detail response must match the requested `docNumber`.
- Filtered structure keys other than the literal string `"null"` must resolve
  to nodes from the base structure response.
- When section clauses are empty, confirm the requested `indexDocumentId`
  against the base structure before classifying the response as an existing
  empty section.

## Cardinality and partial data

- Exact paragraph lookup with zero rows is `not_found`, one valid matching row
  is success, and multiple rows or a malformed required field is
  `source_changed`.
- A null or absent `facilityQna` detail member is `not_found`. When the member
  is present and non-null, missing behavior-driving row fields are
  `source_changed`; required exact-detail fields are never synthesized from
  optional fields.
- Search, structure, section, and Q&A-search arrays may omit malformed rows and
  mark the result partial when at least one valid row remains. A nonempty source
  array with no normalizable rows is `source_changed`.
- Preserve source array order before applying public, explicitly documented
  sorting. Preserve unknown object properties as ignorable extensions rather
  than treating additions alone as drift.
- Ref resolution chooses the deepest matching node, then stable source order,
  and reports ambiguity. Structure and paragraph enrichment is best-effort;
  cancellation always stops both primary and enrichment work.
- Q&A recency controls scan at most 500 rows in pages of at most 50 and report
  partial metadata when the bounded window cannot cover the source count.

## Content and failures

- Preserve public HTML fields where the semantic contract names them. Plain
  text normalization is deterministic and must not invent missing required
  content.
- Malformed JSON, malformed required envelopes, identity mismatches, and
  impossible cardinality are `source_changed`.
- HTTP 404 is `not_found`. HTTP 429 and every 5xx response are retryable
  `source_unavailable`; other non-success statuses are non-retryable
  `source_unavailable`. Connection and timeout failures are retryable
  `source_unavailable`.
- Caller cancellation is execution control, not a capability failure. Public
  projections expose it distinctly as transport-local `aborted` behavior.

The browser persona is an implementation policy used for bounded,
session-coherent access. It is not a claim that KASB requires those headers;
bounded source observations also succeeded with ordinary `curl` requests.
