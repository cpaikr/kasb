# KASB v1 conformance

This directory is the language-neutral compatibility boundary for the TypeScript
and Rust SDKs. `v1/cases.json` declares serialized inputs, fixture-backed full
source URLs, and committed expected outcomes. It contains no imports from either
SDK.

Each SDK runner must:

1. execute the named operation with the JSON input;
2. serve only the declared fixture routes and fail closed on any undeclared request;
3. wrap success as `{ "ok": true, "value": <success envelope> }` and a typed
   capability failure as `{ "ok": false, "error": <failure fields> }`;
4. replace only the paths listed in `canonicalization.replaceWithToken`;
5. compare JSON structurally: object key order is irrelevant, array order is
   significant, missing and `null` differ, and JSON scalar types must match.

The harness wrapper is test protocol, not a public SDK envelope. The nested
success value and failure fields are the public compatibility surface.

`known-bad.json` points at deliberately corrupted outcomes. A conforming judge
must reject all of them and report the declared first-difference class. These
negative controls prevent a runner that merely accepts both implementations.
