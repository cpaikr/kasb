# Agent Tool Improvement Plan

This plan applies Anthropic's "Writing effective tools for agents" guidance to the current KASB CLI capabilities. Items adapted from `../darty/PLAN.md` are included only where they fit this repo's CLI-only product boundary.

Work through the sections in order. Items within the same section are good candidates to implement together because they touch the same contract, eval, diagnostics, or transport boundary.

## Internal agent-eval tool naming

### 10. Namespace internal tool definitions without renaming the CLI

Status: executed for the internal agent-eval seam. No public non-CLI transport has been added.

`../darty/PLAN.md` recommends namespacing exposed agent-native tool names. KASB now applies that pattern only to internal tool-like definitions used by evals:

- Keep current CLI commands unchanged.
- Keep internal capability operation names stable.
- Use namespaced internal tool names where a model receives typed tools directly:
  - `kasb_search_standards`
  - `kasb_get_standard_structure`
  - `kasb_get_section`
  - `kasb_get_paragraph`
  - `kasb_search_qna`
  - `kasb_get_qna`
- Treat MCP, Pi-native, SDK, or another public agent-native transport as still out of scope unless product docs change.

Success criteria:

- Tool-like eval names do not collide with browser, filesystem, web search, or other regulatory tools.
- Names make the expected resource and action obvious before reading the full schema.
- Current CLI-only public scope remains intact.
