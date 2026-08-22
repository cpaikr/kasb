# KASB v1 conformance

This directory is the language-neutral semantic compatibility boundary.
`v1/cases.json` declares serialized inputs, fixture-backed full source URLs, and
committed expected outcomes. It contains no imports from a conformer.

The conformer-neutral judge in `judge.ts` materializes fixture payloads and
executes each public-surface adapter in a separate process. It does not import a
conformer or give a runner the expected outcome. The transition currently has a
complete TypeScript runner and a public Rust SDK runner for `get-paragraph`;
Rust CLI and Rust-backed Node SDK adapters join the same protocol as those
surfaces are implemented. The direct and npm-launched CLI paths must ultimately
produce the same process contract.

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
prove that an upstream paragraph envelope without `paraContents` or with two
exact rows becomes the committed `source_changed` failure; Q&A controls prove
that an absent or null `facilityQna` member is `not_found`. These controls
prevent a runner that merely accepts both implementations.
