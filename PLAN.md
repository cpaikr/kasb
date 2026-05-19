# Agent Tool Improvement Plan

This plan applies Anthropic's "Writing effective tools for agents" guidance to the current KASB CLI capabilities. Items adapted from `../darty/PLAN.md` are included only where they fit this repo's CLI-only product boundary.

Work through the sections in order. Items within the same section are good candidates to implement together because they touch the same contract, eval, diagnostics, or transport boundary.

## Eval feedback loop

### 8. Review descriptions and schemas after eval failures

Use eval transcripts to improve tool ergonomics instead of guessing:

- Look for wrong operation selection.
- Look for new invalid parameter patterns.
- Look for repeated broad searches where a narrower call should work.
- Look for outputs where the model misses the next useful reference.
- Update descriptions, validation messages, result shapes, or examples based on concrete failures.

Success criteria:

- Description changes are backed by eval evidence.
- Invalid calls and unnecessary follow-up calls decrease.
- Tool specs stay compact and accurate.

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
