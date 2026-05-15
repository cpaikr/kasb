# Tool Lifecycle

This is the default sequence for taking a tool from idea to stable design. Detailed rules live in the linked docs.

## Recommended Lifecycle

1. `Identify the capability boundary`
   State the user task, target source, and why generic tools are insufficient. See [foundations.md](foundations.md).
2. `Investigate the source`
   For KASB-like systems, inspect the real API, identifiers, pagination, auth, anti-bot behavior, and update behavior before shaping the public interface.
3. `Define the domain model`
   Choose stable entities, ids, and references that survive UI changes. See [contracts.md](contracts.md).
4. `Write the spec`
   Capture scope, operations, safety, and open questions in `docs/specs/`.
5. `Implement the capability core`
   Keep domain logic separate from source adapters and transports.
6. `Build the CLI transport`
   Default to CLI for this repo and keep other transports out of scope unless product docs change. See [transport-decision.md](transport-decision.md).
7. `Write tests and evals`
   Define fixture tests, live checks, and scenario-driven evals early. See [evaluation.md](evaluation.md).
8. `Add agent guidance`
   Add skills, examples, or wrapper prompts only after the contract is sound.
9. `Review the concrete design`
   Re-check the abstraction after implementation; real code exposes flaws that design notes hide.

## Stable Exit Criteria

- the operation set is narrow and legible
- the output shape is traceable and agent-efficient
- failure modes are explicit
- the tool is faster or more reliable than generic browsing
- eval scenarios cover plausible hard cases
- CLI behavior stays thin and unsurprising
- source-specific ids are isolated from public contracts unless explicitly promoted
