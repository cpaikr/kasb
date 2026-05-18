# Agent Tool Improvement Plan

This plan applies Anthropic's "Writing effective tools for agents" guidance to the current KASB CLI capabilities. Items adapted from `../darty/PLAN.md` are included only where they fit this repo's CLI-only product boundary.

Work through the sections in order. Items within the same section are good candidates to implement together because they touch the same contract, eval, diagnostics, or transport boundary.

## Schema and input contract work

### 1. Enrich capability schemas for agent use

Current CLI help is useful, but exported JSON Schemas are sparse. If these schemas are used by eval tooling or a future tool adapter, agents need the schema itself to explain intent, identifiers, and follow-up paths.

- Add descriptions and examples to every request field and important result field.
- Explain KASB-specific identifiers in schema annotations:
  - `stdNum`: standard number, e.g. `1116`
  - `indexDocumentId`: retrieval-facing section id from `get-standard-structure`
  - `paraNum`: paragraph reference, e.g. `23`, `한2.1`, `B3`, `BC240A`
  - `docNumber`: Q&A document id, e.g. `SSI-35629`
- Keep raw source fields internal unless the v1 spec explicitly exposes them.
- Keep descriptions concise; do not turn schemas into prompt dumps.

Success criteria:

- Exported JSON Schemas are useful without reading CLI help.
- Agents can identify the correct operation and parameters from schema metadata.
- Schema descriptions match the public contract in `docs/specs/kasb-standards-v1.md`.

### 2. Make `get-section` input rules explicit

`get-section` currently requires exactly one of `indexDocumentId` or `ref` at runtime, but the exported schema only makes `stdNum` required.

- Make the XOR rule visible in exported tool metadata or JSON Schema where practical.
- Clarify that `indexDocumentId` comes from `get-standard-structure`.
- Clarify that browser-route `titleDocumentId` values are not accepted.
- Keep runtime validation as the source of truth and keep its error messages aligned with the schema.

Success criteria:

- Agents know they must pass either `indexDocumentId` or `ref`, not both.
- Invalid calls fail with a parameter-specific `invalid_input` response.
- Tool metadata and runtime behavior do not contradict each other.

### 9. Improve source-shaped inputs only where agents struggle

`../darty/PLAN.md` flags cryptic source codes. KASB has fewer exposed source-shaped fields, but some still need care.

Focus fields:

- `types` in `search-qna`
- `indexDocumentId` in section retrieval
- `ref` as an alternate section lookup
- appendix-style `paraNum` values such as `한2.1`, `B3`, `BC240A`

Possible improvements:

- Add richer field descriptions and examples.
- Document the default Q&A `types` set and when to override it.
- Keep `types` source-facing unless a stable semantic enum is evidence-backed.
- Consider lookup/list capabilities only if evals show repeated code-discovery failures.

Success criteria:

- Agents can use common filters and identifiers without guessing.
- Invalid-code or stale-id errors provide actionable correction hints.
- Source-shaped fields remain explicit where exact KASB behavior matters.

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

### 5. Add explicit response detail controls

The docs mention `summary`, `structured`, and `raw`, but the CLI currently only supports `--pretty`. Some outputs can become large, especially full structures, sections, and Q&A documents.

- Add a CLI output/detail option, for example:
  - `--output summary`
  - `--output structured`
  - `--output raw`
- Preserve the existing structured default unless the spec and tests are updated to approve a default change.
- Make `summary` the smallest response that still supports follow-up calls.
- Preserve stable references in every mode.
- Keep raw HTML/source fragments opt-in when possible.
- Apply first to high-volume operations:
  - `get-standard-structure`
  - `get-section`
  - `get-qna`
  - `search-qna`

Success criteria:

- Agents can request token-efficient outputs without losing follow-up references.
- Detailed/raw evidence remains available for verification.
- All modes still emit a JSON envelope with `result`, `metadata`, `references`, and `warnings`.
- Output-mode behavior is covered by CLI and capability tests.

### 6. Reclassify routine format notes vs real warnings

Some current warnings describe expected behavior, not exceptional conditions. For agents, warnings should mean "pay attention" rather than "this field contains HTML as designed."

- Review warning codes across operations.
- Move routine notes such as preserved HTML into `metadata` or result field descriptions when they are expected.
- Reserve `warnings` for partial normalization, source drift risk, ambiguity, empty sections, truncation, and other action-worthy states.
- Fix inconsistent warning semantics, especially `search-qna` using `source_html_preserved` while saying highlights were normalized to plain text.
- Update the v1 spec and tests together with any warning contract change.

Success criteria:

- Warnings represent recoverable or citation-relevant conditions.
- Agents do not need to special-case normal output-format notes as warnings.
- Warning names and messages accurately describe what happened.

### 7. Improve recovery hints in failures

Typed failures exist, but recovery guidance can be more actionable for agents.

- For stale or wrong section ids, mention the recovery path: run `get-standard-structure` and use its `indexDocumentId`.
- For suspected `titleDocumentId` inputs, explicitly say browser route ids are not accepted in v1.
- For invalid numeric limits/pages, include accepted ranges.
- For no-result searches, suggest broader or source-relevant search terms only when evidence-backed.
- Keep failure envelopes parseable and concise.

Success criteria:

- Common invalid calls lead agents to the next correct call.
- Failure messages identify the bad parameter or source URL when known.
- No human-readable diagnostics leak into operation `stdout`.

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
