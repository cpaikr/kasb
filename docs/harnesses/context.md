# Harness Context

## Definition

In this repo, `context` means any input given to an agent.

That includes:

- system and role instructions,
- task inputs,
- retrieved files or records,
- prior artifacts,
- memory reads,
- runtime status,
- human feedback.

## Context Types

- `static context`
  Stable instructions, role guidance, and domain policy.
- `retrieved context`
  Files, search results, database rows, laws, or web pages fetched at runtime.
- `inherited context`
  Artifacts and outputs produced by earlier steps.
- `runtime context`
  Current task status, open questions, budgets, and constraints.

## Core Principle

The goal is not to maximize context. The goal is to supply the smallest high-signal context that lets the agent succeed.

## Default Guidance

- keep each agent's context local to its role,
- prefer retrieval over large upfront dumps,
- pass artifacts and references instead of whole histories,
- summarize before handing off,
- isolate deep exploration inside subagents when possible,
- make context boundaries visible in the harness design.

## Progressive Disclosure

Good harnesses rarely preload everything.

Prefer:

1. enough context to start,
2. tools or retrieval paths for targeted expansion,
3. concise summaries or artifacts for handoff.

This keeps working memory small while preserving access to detail.

## Context Anti-Patterns

- injecting the same large context into every node,
- using shared memory as a substitute for handoff design,
- forcing agents to reread raw source material that another node already structured,
- passing long conversational transcripts when an artifact would do,
- hiding uncertainty or provenance inside prose summaries.

## Practical Recommendation

If you are unsure, start with this rule:

- give each agent a narrow role,
- inject only the inputs needed for that role,
- let the agent retrieve more when justified,
- return a small artifact with references for the next step.

## Related Reading

- [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
