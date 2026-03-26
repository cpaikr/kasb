# Tool Lifecycle

This is the default sequence for taking a tool from idea to stable design. Detailed rules live in the linked docs.

## Recommended Lifecycle

1. `Identify the capability boundary`
   State the user task, target source, and why generic tools are insufficient. See [foundations.md](foundations.md).
2. `Investigate the source`
   For external systems, inspect the real API, identifiers, pagination, auth, and update behavior before shaping the public interface.
3. `Define the domain model`
   Choose stable entities, ids, and references that survive UI changes. See [contracts.md](contracts.md).
4. `Write the spec`
   Capture scope, operations, safety, and open questions with [templates/tool-spec-template.md](templates/tool-spec-template.md).
5. `Implement the capability core`
   Keep domain logic separate from adapters.
6. `Choose adapters`
   Default to CLI first, then add MCP or SDK only when justified. See [transport-decision.md](transport-decision.md).
7. `Write evals`
   Define scenario-driven tests and hard cases early. See [evaluation.md](evaluation.md).
8. `Add agent guidance`
   Add skills, examples, or wrapper prompts only after the contract is sound.
9. `Review the concrete design`
   Re-check the abstraction after implementation; real code exposes flaws that design notes hide.

## Stable Exit Criteria

- the operation set is narrow and legible,
- the output shape is traceable and agent-efficient,
- failure modes are explicit,
- the tool is faster or more reliable than generic browsing,
- eval scenarios cover plausible hard cases,
- adapter behavior stays thin and unsurprising.
