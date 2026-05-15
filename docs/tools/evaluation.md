# Evaluation

This document is about evaluating one tool or capability.

## What To Evaluate

Do not stop at unit correctness.

An agent tool should be evaluated on:

- `task success`
  Does it help the agent complete the actual user task?
- `call efficiency`
  How many tool calls and retries are needed?
- `output usability`
  Does the result shape reduce model reasoning burden?
- `failure clarity`
  Can the agent recover when something goes wrong?
- `source faithfulness`
  Are references and extracted facts traceable?
- `latency`
  Is the tool fast enough to actually be preferred?

## Eval Types

### Contract tests

Verify input validation, output shape, JSON Schema export, and failure codes. Keep these near the code that owns the contract, usually colocated `*.test.ts` files.

### Source and fixture tests

For KASB capabilities, preserve canonical fixtures and expected normalized outputs for the implemented source surface.

Initial fixture targets:

- `/api/standard?searchWord=리스`
- `/api/standard-indexes/1116`
- `/api/paragraphs/1116/ZB2hJW`
- `/api/paragraphs/content/1116/23`
- appendix-style paragraph lookups such as `한2.1`, `B3`, and `BC240A`

### Live checks

Use opt-in live checks for source behavior that fixtures cannot prove, such as source drift, id mismatches, and endpoint availability.

In this repo, those should belong under `test/live/` and be gated by `LIVE_KASB_TESTS=1` once tests exist.

### Scenario evals

Use user-like tasks at the capability level. Put scenario-style CLI and model-in-the-loop checks under `evals/` when they exercise live task usefulness or agent/tool wiring rather than narrow unit behavior.

CLI smoke tests should assert stream and exit behavior:

- success: exit code `0`, JSON envelope on `stdout`, empty `stderr`
- failure: nonzero exit code, empty `stdout`, JSON failure envelope on `stderr`

Initial deterministic scenarios:

- search `리스` and identify standard `1116`
- retrieve the structure for `1116` and find `ZB2hJW`
- fetch section `1116 / ZB2hJW` and cite paragraphs `1` and `2`
- fetch paragraph `1116 / 23` by exact paragraph reference

Future agentic eval examples:

- "Find the KASB paragraph most relevant to leases and cite the paragraph number."
- "Retrieve the section that contains paragraphs 1 and 2 of K-IFRS 1116."
- "Compare the source references for paragraphs 23 and B3 without using browser navigation."

### Adversarial evals

Probe:

- stale identifiers
- route-facing `titleDocumentId` values supplied as section ids
- empty section responses
- paragraph numbers with Korean prefixes or appendix forms
- source-side JSON shape changes
- rate-limited or partially unavailable surfaces
- HTML fragments that need preservation or cleanup

## Measure Agent Burden

A tool can be technically correct and still poor for agents.

Watch for:

- too much raw text
- unclear field naming
- missing references
- outputs that require the model to reconstruct document structure
- outputs that hide uncertainty
- failures that do not identify the bad parameter or source URL
- CLI failures that are not parseable JSON

## Recommended Artifact Per Capability

Each future capability eval track should have a compact eval document with:

- target tasks
- success criteria
- representative fixtures
- known failure classes
- benchmark expectations
- version notes when the upstream source changes
