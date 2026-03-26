# Harness Memory

## Goal

Memory exists to preserve useful information outside one context window.

In most harnesses, the most important memory is `progress memory`: what has been done, what remains open, and what artifacts now exist.

## Keep Memory Separate From Context

- `memory`
  Persisted information available for later reuse.
- `context`
  The subset of information given to the agent now.

Memory can become context when the harness retrieves it for a step.

## Useful Memory Classes

- `progress memory`
  Status, decisions, open questions, next steps.
- `artifact memory`
  Reports, extraction outputs, evidence tables, review notes.
- `shared factual memory`
  Reusable facts gathered during the workflow.
- `durable knowledge`
  Domain guidance or reusable knowledge across runs.

Not every harness needs all of them.

## Default Guidance

- keep the primary coordination path in structured handoffs,
- use memory to persist progress and durable artifacts,
- prefer append-friendly, inspectable formats,
- preserve source references when writing shared facts,
- keep authoritative artifacts distinct from scratch notes,
- design retrieval rules before increasing memory volume.

## Shared Memory Risks

- stale or conflicting entries,
- low-signal accumulation,
- poor retrieval precision,
- hidden authority problems,
- accidental reuse of unverified notes.

If a memory surface grows without curation, it becomes another source of context failure.

## Practical Recommendation

Start with the smallest memory model that supports the workflow:

- one progress log,
- one artifact store,
- optional shared notes only when needed.

Expand memory surfaces only after the harness proves it needs them.
