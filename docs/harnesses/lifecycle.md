# Harness Lifecycle

This is the default sequence for taking a harness from idea to stable design. Detailed rules live in the linked docs.

## Recommended Lifecycle

1. `Identify the workflow boundary`
   State the target workflow, success condition, and why a single-agent session is insufficient. See [foundations.md](foundations.md).
2. `Decide whether multiple agents are justified`
   Do not add coordination overhead without a context, parallelism, or long-running continuity reason.
3. `Choose the topology`
   Pick the simplest pattern that fits the workflow. See [patterns.md](patterns.md).
4. `Define node boundaries`
   Give each node a clear role, inputs, outputs, tools, and policy.
5. `Design handoffs`
   Define the artifact and reference shape that one node passes to the next.
6. `Design the context strategy`
   Decide what is injected, what is retrieved, and what is summarized. See [context.md](context.md).
7. `Design the memory strategy`
   Add only the memory surfaces needed for progress, artifacts, and durable reuse. See [memory.md](memory.md).
8. `Define human checkpoints`
   Decide where approval, review, or correction should happen.
9. `Write evals`
   Test handoffs, context budgets, failure recovery, and long-running continuity early. See [evaluation.md](evaluation.md).
10. `Review the concrete design`
   Re-check whether the harness is too complex for the job. Real workflows expose unnecessary nodes and weak handoffs quickly.

## Stable Exit Criteria

- the chosen topology matches the workflow,
- node boundaries are clear,
- context stays bounded at each step,
- artifacts are traceable and reusable,
- memory surfaces are minimal and legible,
- human intervention points are explicit,
- eval scenarios cover plausible failure paths,
- a simpler harness would not do the job as well.
