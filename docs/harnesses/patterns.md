# Harness Patterns

Use this document to choose a harness shape. Start with the simplest pattern that fits the workflow.

## Communication Modes

### Structured handoffs

Agents communicate through explicit inputs and outputs.

Pros:

- easiest to audit,
- easiest to test,
- keeps contexts bounded,
- reduces shared-state confusion.

Cons:

- less flexible for exploratory collaboration,
- handoff schemas need design work up front.

This should be the default for most harnesses.

### Shared memory

Agents communicate through a common memory surface such as notes, artifacts, or progress files.

Pros:

- flexible,
- good for long-running work,
- useful for human inspection and intervention.

Cons:

- easier to pollute,
- harder to know what is authoritative,
- retrieval quality becomes a bottleneck.

Use shared memory as support infrastructure, not as the default coordination path.

### Direct agent messaging

Agents exchange messages without a durable artifact boundary.

Pros:

- natural for fast back-and-forth,
- useful in highly interactive workflows.

Cons:

- harder to audit,
- harder to replay,
- easy to waste context on chatter.

Use this only when conversational iteration is genuinely central to the task.

### Orchestrator-mediated routing

A control node assigns work, gathers results, and decides next steps.

Pros:

- strong control over retries, escalation, and policy,
- easier global coordination,
- useful when branches must be reconciled.

Cons:

- more central complexity,
- can become a bottleneck,
- failure of the orchestrator affects the whole run.

Add this when routing logic is non-trivial.

## Common Patterns

### Linear pipeline

One agent's output becomes the next agent's input.

Best for:

- staged document processing,
- deterministic workflows,
- workflows with clear phase boundaries.

### Orchestrator-worker

A lead node decomposes work and delegates bounded tasks.

Best for:

- branching work,
- retries and exception handling,
- workflows that need global synthesis.

### Map-reduce

Many workers process isolated slices, then one node aggregates results.

Best for:

- large corpora,
- sectioned documents,
- broad search and synthesis tasks.

### Reviewer loop

One node produces, another critiques, then the producer revises.

Best for:

- high-stakes outputs,
- policy or quality checks,
- workflows where silent failure is expensive.

### Long-running session harness

The system advances across multiple sessions using progress artifacts and resumable state.

Best for:

- work that exceeds one context window,
- work that spans hours or days,
- workflows that need human checkpoints.

## Selection Heuristics

- Choose `linear pipeline` when the workflow already has stable stages.
- Choose `map-reduce` when isolation and parallelism matter more than interaction.
- Choose `orchestrator-worker` when routing and exception handling are first-class.
- Choose `reviewer loop` when correctness matters more than raw speed.
- Choose `long-running session` patterns when progress continuity is the main risk.

Default recommendation:

- use agent nodes,
- communicate through structured handoffs,
- attach shared memory only where it clearly helps,
- keep topology as simple as the task allows.
