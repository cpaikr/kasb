# Agent Tool Improvement Plan

This plan applies Anthropic's "Writing effective tools for agents" guidance to the current KASB CLI capabilities. Items adapted from `../darty/PLAN.md` are included only where they fit this repo's CLI-only product boundary.

Work through the sections in order. Items within the same section are good candidates to implement together because they touch the same contract, eval, diagnostics, or transport boundary.

## Completed schema and input contract work

### 2. Make `get-section` input rules explicit

Status: completed.

Implemented outcomes:

- Exported JSON Schema now exposes the `get-section` locator XOR rule for `indexDocumentId` vs `ref`.
- `indexDocumentId` descriptions point agents back to `get-standard-structure` and its `titleDocumentId` field.
- Runtime validation keeps parameter-specific `invalid_input` failures for missing or conflicting section locators.
- Tests cover the exported XOR metadata and request-validation behavior.

### 9. Improve source-shaped inputs only where agents struggle

Status: completed for the currently evidenced schema/input-contract work.

Implemented outcomes:

- `search-qna.types` now documents the observed default Q&A type set and emits a numeric CSV JSON Schema pattern aligned with runtime validation.
- `indexDocumentId`, `ref`, and appendix-style `paraNum` examples/descriptions are richer in exported schemas.
- `types` remains source-facing; no semantic enum or lookup capability was added without eval evidence.
- Tests cover the important identifier examples, Q&A type metadata, and malformed `types` rejection.

Further lookup/list capabilities remain deferred until evals show repeated code-discovery failures.

## Eval baseline and feedback loop

### 3. Add an internal typed tool-use eval track without changing the public product

`../darty/PLAN.md` recommends agent-native typed tool definitions. For this repo, public MCP/Pi-native tools are out of scope, but a typed eval harness can still test the capability schemas directly.

- Keep the product CLI-only.
- Add internal eval definitions that map directly to `src/app/*` operations instead of CLI argv.
- Test typed parameters separately from CLI syntax.
- Ensure typed eval calls return the shared capability envelopes.
- Keep CLI evals for command discoverability and stream/exit behavior.

Success criteria:

- CLI syntax reasoning is isolated to CLI evals.
- Capability/tool ergonomics can be tested without subprocess noise.
- No new public transport is introduced.

### 4. Add scenario evals for multi-step KASB research

Current tests are strong for contracts and fixtures, but the repo needs realistic agent workflow evals like Anthropic recommends. Add these before larger response-shape changes so later changes can be measured.

Add scenario evals under `evals/` using tasks from `docs/tools/cli-tryouts.md`, such as:

- Search `리스`, identify standard `1116`, retrieve relevant structure, then cite paragraph `23`.
- Retrieve the section containing paragraphs `1` and `2` of K-IFRS 1116.
- Find Q&A documents about `리스` and fetch a cited `docNumber`.
- Compare paragraphs `23` and `B3` without browser navigation.
- Handle a wrong `titleDocumentId` by recovering through `get-standard-structure`.

Track metrics:

- task success
- tool-call count
- invalid calls/retries
- runtime
- output size or token proxy
- reference usability

Success criteria:

- Evals represent real standards research tasks, not only one-call smoke tests.
- Failures reveal whether the issue is naming, schema design, output shape, or source behavior.
- Held-out scenarios are kept separate from scenarios used to tune descriptions.

### 8. Review descriptions and schemas after eval failures

Use eval transcripts to improve tool ergonomics instead of guessing.

- Look for wrong operation selection.
- Look for invalid parameter patterns.
- Look for repeated broad searches where a narrower call should work.
- Look for outputs where the model misses the next useful reference.
- Update descriptions, validation messages, result shapes, or examples based on concrete failures.

Success criteria:

- Description changes are backed by eval evidence.
- Invalid calls and unnecessary follow-up calls decrease.
- Tool specs stay compact and accurate.

## Output shape and diagnostics

Status: completed for the first high-volume CLI pass.

Implemented outcomes:

- Added `--output summary|structured|raw` to `get-standard-structure`, `get-section`, `search-qna`, and `get-qna` while preserving structured output as the default.
- Summary mode projects smaller `result` payloads while preserving operation-level `metadata`, `references`, and `warnings`.
- Output-mode option generation now honors each command's configured mode list instead of accepting unsupported modes by default.
- Reclassified routine HTML preservation and highlight normalization from warnings into `metadata.content` notes.
- Added local recovery hints for paragraph ranges and numeric-only Q&A document numbers.
- Updated the v1 spec, README stream contract, and tests for the new diagnostics behavior.

## Deferred transport naming

### 10. Decide future exposed namespacing only if a new transport is approved

`../darty/PLAN.md` recommends namespacing future exposed tool names. This applies only if product docs later approve MCP, Pi-native, SDK, or another agent-native transport.

- Do not rename current CLI commands for namespacing alone.
- If a future transport is approved, prefer names that remain distinct in a large toolset, for example:
  - `kasb_search_standards`
  - `kasb_get_standard_structure`
  - `kasb_get_section`
  - `kasb_get_paragraph`
  - `kasb_search_qna`
  - `kasb_get_qna`
- Keep internal capability operation names stable unless a separate rename is justified.

Success criteria:

- Future tool names do not collide with browser, filesystem, web search, or other regulatory tools.
- Names make the expected resource and action obvious before reading the full schema.
- Current CLI-only scope remains intact.
