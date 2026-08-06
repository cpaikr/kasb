# Rust migration parity evidence

## Judge contract

The language-neutral case manifest is
[`conformance/v1/cases.json`](../../../conformance/v1/cases.json). SDK-specific
runners execute those JSON inputs against only their declared root-level
fixtures and compare the canonical serialized outcome. The harness framing is
not a product envelope; its nested success value and typed failure fields are.

Comparison rules:

- object key order ignored;
- array order exact;
- missing, `null`, and present values distinct;
- JSON scalar types exact;
- only `$.value.metadata.fetchedAt` replaced with a stable token.

## Phase-1 inventory and baseline

| Evidence | Count | Status |
| --- | ---: | --- |
| v1 operations represented | 6 | passing |
| fixture-backed success outcomes | 6 | passing against TypeScript |
| typed invalid-input outcomes | 6 | passing against TypeScript |
| total baseline cases | 12 | passing against TypeScript |
| controlled known-bad outcomes | 3 | all rejected at their declared paths |

The representative cases cover `search-standards`,
`get-standard-structure`, `get-section`, `get-paragraph`, `search-qna`, and
`get-qna`. Committed expectations preserve public envelopes and failure fields
rather than projections.

Negative controls in [`conformance/v1/known-bad.json`](../../../conformance/v1/known-bad.json):

| Control | Required detection | Observed detection |
| --- | --- | --- |
| wrong paragraph `uniqueKey` | value mismatch at `$.value.result.paragraph.uniqueKey` | rejected at the declared path |
| wrong typed failure code | value mismatch at `$.error.code` | rejected at the declared path |
| numeric request `stdNum` replacing a string | type mismatch at `$.value.result.request.stdNum` | rejected at the declared path |

Validation command:
`bun test packages/kasb-ts/test/conformance/conformance.test.ts`.

## Resolved baseline discrepancies

- The metadata schema described an endpoint family while TypeScript emitted the
  actual request URL. The schema/spec now require the actual absolute URL.
- Paragraph `indexDocumentId` was described as optional but was required by the
  schema/provider and present in observed responses. The spec now makes it
  required.
- TypeScript silently selected the first row when an exact paragraph response
  contained multiple rows. The spec and provider now classify that drift as
  `source_changed`.
- HTTP 429 was non-retryable in TypeScript despite the migration invariant that
  callers can respect rate limits. It is now retryable, while the pilot still
  performs no automatic retry.
- Caller cancellation is SDK execution control rather than a capability failure
  code. TypeScript exposes `aborted` at its public toolset boundary; Rust will
  expose `Cancelled` without serializing a false source failure.
- The pinned `wreq` packages declare Rust 1.85, but their required
  `typed-builder-macro` release uses syntax stabilized in Rust 1.88. An exact
  1.85 build reproduced the failure; the workspace minimum is therefore 1.88,
  and the full Rust suite passes on that toolchain without vendoring a patched
  transitive macro.

## Phase-4 Rust pilot

The Rust runner independently consumes the two `get-paragraph` entries in the
same root `conformance/v1/cases.json` manifest and compares its serialized
success and invalid-input outcomes with the TypeScript baselines. Both pass;
only `metadata.fetchedAt` is canonicalized.

The fixture-backed Rust suite additionally covers numeric, Korean-prefixed,
appendix, and basis-for-conclusions paragraph forms. Injected transport cases
cover empty exact lookup, multiple rows, required-field and identity drift,
non-JSON success, 4xx/429/5xx retryability, timeout, zero retry, failed or
missing enrichment, and cancellation during both source requests. Cancellation
remains an SDK-local control outcome, so it is tested against the rulebook
rather than forced into the shared serialized capability-failure envelope.

No TypeScript/Rust semantic discrepancy was found in the two shared paragraph
cases. Rust-specific persona ownership and cancellation are the already-approved
runtime differences recorded in the rulebook.

## Next gate

Complete review and PR delivery without beginning phase 5.
