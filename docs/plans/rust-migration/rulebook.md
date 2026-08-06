# Rust migration translation rulebook

This file records durable TypeScript-to-Rust decisions for the additive native
SDK. [The v1 spec](../../specs/kasb-standards-v1.md) is normative; TypeScript is
an executable baseline, not a source of truth when it conflicts with the spec
or observed KASB behavior.

## Compatibility boundary

- Operation ids, JSON request fields, success envelopes, warning codes, typed
  failure fields, and identifier meaning are shared.
- Rust uses native public types and `serde`; it does not expose Effect Schema
  types or call the TypeScript package.
- Object key order is irrelevant. Array order, scalar JSON types, omission
  versus `null`, and exact normalized content are significant.
- Optional public fields use `Option<T>` plus `skip_serializing_if =
  "Option::is_none"`. They are omitted, never serialized as `null`.
- `metadata.fetchedAt` is injected by a clock and is the only field
  canonicalized by deterministic conformance tests.
- Public JSON fields use camelCase. Rust type and method names follow Rust
  conventions; serialization is the compatibility boundary.

## v1 inventory

| Operation | Public request | Public payload | KASB endpoint | Shared fixture family |
| --- | --- | --- | --- | --- |
| `search-standards` | `keyword`, optional `limit`, `sort` | ranked standards, counts, suggestions, next actions | `GET /api/standard?searchWord=...` plus best-effort indexes enrichment | `search-standards-lease`, standard indexes |
| `get-standard-structure` | `stdNum`, optional `keyword` | ordered section nodes | `GET /api/standard-indexes/{stdNum}` and `/searchWord?searchWord=...` | `standard-indexes-1116*` |
| `get-section` | `stdNum`, exactly one of `indexDocumentId`/`ref`, optional `keyword` | section plus ordered clauses | `GET /api/paragraphs/{stdNum}/{indexDocumentId}` plus indexes resolution/enrichment | `section-1116-ZB2hJW`, standard indexes |
| `get-paragraph` | `stdNum`, `paraNum` | one exact paragraph | `GET /api/paragraphs/content/{stdNum}/{paraNum}` plus best-effort indexes enrichment | `paragraph-1116-{23,han2.1,B3,BC240A}`, standard indexes |
| `search-qna` | `keyword`, optional paging/type/date controls | Q&A search page and counts | `GET /api/qnas/v2?...` | `search-qna-lease` |
| `get-qna` | `docNumber`, optional `keyword` | one full Q&A document | `GET /api/qnas/v2/{docNumber}` | `qna-SSI-35629` |

Every operation accepts an SDK request context containing an optional caller
cancellation signal. The signal reaches every primary, resolution, enrichment,
and bounded-pagination source request made by that operation. TypeScript uses
`AbortSignal`; Rust uses the crate's `CancellationToken`. Both interrupt the
in-flight request and surface cancellation through the SDK-local cancellation
path rather than a capability failure.

| Operation | Typed capability failures | Cancellation path |
| --- | --- | --- |
| `search-standards` | `invalid_input`, `source_unavailable`, `source_changed` | primary search and best-effort indexes enrichment |
| `get-standard-structure` | `invalid_input`, `not_found`, `source_unavailable`, `source_changed` | structure or filtered-structure request |
| `get-section` | `invalid_input`, `not_found`, `source_unavailable`, `source_changed`, `partial_retrieval` | optional ref resolution, section fetch, and metadata enrichment |
| `get-paragraph` | `invalid_input`, `not_found`, `source_unavailable`, `source_changed` | exact paragraph fetch and best-effort indexes enrichment |
| `search-qna` | `invalid_input`, `source_unavailable`, `source_changed` | every page in the bounded search window and metadata lookup |
| `get-qna` | `invalid_input`, `not_found`, `source_unavailable`, `source_changed` | document request and any metadata lookup |

`internal_failure` remains the boundary fallback for an unexpected non-capability
exception in every operation. It is not an expected source outcome and must not
be used for validation, cancellation, or known transport/source conditions.

The phase-4 pilot implements only `get-paragraph`. The remaining inventory is
recorded so later capabilities do not redefine shared terms, but phase 5 is not
authorized by the active goal.

## Request validation

- Reject non-object input, unknown fields, non-string string parameters,
  missing values, and blank-after-trim values before source access.
- Trim `stdNum` and `paraNum` exactly as TypeScript does.
- Reject `paraNum` containing `~` as `invalid_input` on `paraNum`; callers use
  `get-section` for ranges.
- Numeric, Korean-prefixed, appendix, and basis-for-conclusions forms remain
  opaque strings. Do not parse them into numeric components.
- Percent-encode each URL path segment independently.

## Results and serialization

- Success is exactly `{result, metadata, references, warnings}`.
- `metadata.source.endpoint` is the absolute request URL, not an endpoint
  template. `metadata.sourceBehavior` retains the observed KASB API base.
- Paragraph `documentId` maps to required public `indexDocumentId`.
- `uniqueKey` must equal `{stdNum}-{paraNum}` and all three source identifiers
  must match the normalized request.
- An empty `paraContents` array is `not_found`. More than one row is
  `source_changed`; exact lookup never chooses an arbitrary row.
- `documentId`, `stdNum`, `paraNum`, `uniqueKey`, `paraContent`, and
  `fullContent` are required source fields. Missing required fields are
  `source_changed`; the pilot does not synthesize `fullContent` from HTML.
- Preserve `paraContent` byte-for-byte. Port the existing narrow
  `normalizeKasbPlainText` behavior for `fullContent`: known block boundaries,
  tag removal, selected named/numeric entities, whitespace collapse, newline
  trimming, and Korean list-marker spacing. Do not substitute a general HTML
  parser unless both implementations and shared expectations change together.
- Source array order is preserved unless the operation contract explicitly
  defines sorting. Maps serialize with no semantically significant key order.

## Enrichment

- After the exact paragraph fetch succeeds, query
  `/api/standard-indexes/{stdNum}` for best-effort `standardTitle`,
  `standardKind`, `sectionTitle`, and `sectionRef`.
- A successful parent match yields no warning. Missing or failed enrichment
  yields success with `paragraph_metadata_incomplete`; it does not downgrade
  paragraph completeness.
- Caller cancellation during enrichment cancels the whole operation. Other
  enrichment transport, timeout, or source-shape failures are swallowed into
  the metadata warning.

## Errors, timeout, cancellation, and retry

| Condition | Shared result |
| --- | --- |
| invalid request | `invalid_input`, non-retryable, with `parameter` |
| HTTP 404 or empty exact result | `not_found`, non-retryable, with `sourceUrl` after access |
| HTTP 429 | `source_unavailable`, retryable, with `sourceUrl` |
| other HTTP 4xx | `source_unavailable`, non-retryable |
| HTTP 5xx, connect/body failure, timeout | `source_unavailable`, retryable |
| non-JSON or required source-shape/identity drift | `source_changed`, non-retryable |
| caller cancellation | SDK-local cancellation error, not a public capability failure |

- The pilot request timeout is 15 seconds and connect timeout is 10 seconds.
- Rust exposes cancellation as a distinct `Cancelled` SDK error and uses
  `tokio::select!` so dropping/cancelling the request future stops awaiting the
  `wreq` request. Serialized capability failures never mislabel cancellation as
  timeout or source unavailability.
- The TypeScript public toolset already exposes transport-local `aborted`; its
  lower provider error is not the shared public SDK surface.
- The pilot performs zero automatic retries. Zero is a bounded policy and
  avoids replaying against rate limits without an agreed `Retry-After` policy.
  A retryable failure tells the caller it may make a later attempt. Adding
  automatic retries is a future cross-capability decision, not pilot scope.

## `wreq` persona

- Pin `wreq = =6.0.0-rc.29` and `wreq-util = =3.0.0-rc.14`; commit
  `Cargo.lock`. Any upgrade must rerun conformance and persona/fingerprint
  checks.
- The minimum Rust version is 1.85, matching the pinned crates.
- One `PersonaClient` owns one long-lived `wreq::Client`, connection pool,
  in-memory cookie store, optional fixed proxy, concurrency semaphore, timeouts,
  and immutable emulation profile.
- The default pilot persona is `wreq_util::Emulation::Chrome131`. Do not
  override its user-agent or client hints.
- API requests add only coherent API-fetch context (`Accept: application/json`
  and Korean-preferred `Accept-Language`). Navigation headers are not reused for
  JSON API fetches.
- Default maximum in-flight requests per persona is 8; idle connections may be
  pooled for 90 seconds with at most 8 idle connections per host.
- Proxy and cookie affinity never change during a persona lifetime. Rotation
  means constructing a new `PersonaClient`; requests do not randomize identity.
- Fingerprint emulation is transport configuration, not JavaScript execution or
  browser automation. HTTP/3 is not required by the observed KASB source and is
  not added to the pilot.

## Source boundaries and testability

- `capabilities/` owns public requests/results, validation, error mapping, and
  orchestration.
- `sources/kasb/` owns private response models, URL construction, KASB shape
  validation, normalization, and enrichment mapping.
- `http/` owns persona construction and request policy. Capability code depends
  on an injectable async transport trait so fixture, timeout, and cancellation
  tests never require live KASB access.
- Live checks remain opt-in and cannot replace fixture-backed or conformance
  evidence.

No pilot mapping decision remains unresolved. New evidence may amend this file,
but must record the discrepancy and update both implementations or the spec as
appropriate.
