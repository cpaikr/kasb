# KASB v1 conformance

This directory is the language-neutral semantic compatibility boundary.
`v1/cases.json` declares serialized inputs, fixture-backed full source URLs, and
committed expected outcomes. It contains no imports from a conformer.

The conformer-neutral judge in `judge.ts` materializes fixture payloads and
executes each public surface in a separate process. It does not import a
conformer or give a runner the expected outcome. It independently exercises the
public Rust SDK, Rust CLI, and Rust-backed Node SDK for all six v1 operations.
The CLI gate builds the real Rust binary twice: a fixture-enabled binary for
black-box operation checks and a production binary proving that fixture support
is absent. Direct and npm-launched CLI equivalence is exercised by the native
packed-consumer gates.

Each conforming public-surface runner must:

1. execute the named operation with the JSON input;
2. match each absolute `requestUrl` as an exact string, serve only those
   declared fixture routes, and fail closed on any undeclared request;
3. wrap success as `{ "ok": true, "value": <success envelope> }` and a typed
   capability failure as `{ "ok": false, "error": <failure fields> }`.

The judge replaces only paths listed in
`canonicalization.replaceWithToken`, then compares JSON structurally: object
key order is irrelevant, array order is significant, missing and `null`
differ, and JSON scalar types must match.

The judge sends one JSON document on stdin:

```json
{
  "protocolVersion": 1,
  "caseId": "get-paragraph-success",
  "operation": "get-paragraph",
  "input": {},
  "routes": [{ "requestUrl": "https://example.test/api", "payload": {} }]
}
```

A runner writes exactly one outcome document to stdout and exits successfully.
Capability failures are outcome data; nonzero exit, unexpected stderr, timeout,
invalid JSON, or an undeclared request is a runner failure. Fixture paths and
expected outcomes stay in the judge process.

`cli-judge.test.ts` verifies every Rust CLI command against those committed
semantic outcomes and exact outbound request multisets. It also covers help,
failure transport, summary/raw projections, alias precedence, production
feature isolation, and OS-native signal termination. Deliberate bad controls
prove that exit, stderr, newline, and JSON drift are detected before the real
binary is judged.

`node-sdk.test.ts` stages a judge-only Node addon and invokes the public Node
facade in a separate process. The addon routes every operation through the same
Rust SDK entrypoints as production while failing closed on undeclared or
multiply used fixture routes. Judge-only exports are forbidden in release
builds.

The harness wrapper is test protocol, not a public SDK envelope. The nested
success value and failure fields are the public compatibility surface.

Expected outcomes are manually reviewed evidence, not routine generated build
output. The legacy capture helper is absent from package scripts and refuses to
write unless `KASB_REVIEWED_BASELINE_UPDATE=1` is set for an explicit baseline
review.

`known-bad.json` points at deliberately corrupted outcomes. A conforming judge
must reject all of them and report the declared first-difference class. The
controls cover a wrong success value, wrong failure category, serialization
type drift, and corrupted source metadata. The shared malformed-source cases
prove that missing required standards, structure, section, paragraph, or Q&A
search envelopes become the committed `source_changed` failures. Paragraph
controls also reject multiple exact rows, while Q&A detail controls prove that
an absent or null `facilityQna` member is `not_found`. These controls prevent a
runner that merely accepts every public surface.
