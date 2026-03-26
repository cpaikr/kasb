# Harness Evaluation

## What To Evaluate

Do not evaluate a harness only on final task success.

A harness should be evaluated on:

- `task success`
  Does the full system complete the real workflow?
- `context efficiency`
  Does each node receive focused, high-signal inputs?
- `coordination quality`
  Do handoffs reduce confusion and duplicated work?
- `provenance`
  Can outputs be traced back to sources and intermediate artifacts?
- `failure recovery`
  Can the harness retry, escalate, or degrade gracefully?
- `operability`
  Can a human inspect progress and intervene when needed?
- `cost and latency`
  Does the topology justify its overhead?

## Eval Types

### Pattern fit tests

Check whether the chosen topology actually matches the workflow shape.

### Handoff tests

Verify that one node's output is sufficient for the next node to work without hidden context.

### Context budget tests

Probe whether nodes succeed with bounded context rather than oversized prompts.

### Failure-path tests

Probe:

- missing context,
- stale memory,
- conflicting worker outputs,
- tool failures,
- retrieval misses,
- human-review checkpoints,
- partial completion across sessions.

### Long-running continuity tests

Verify that progress memory and resumable artifacts let the system continue cleanly in a later session.

## Common Failure Signals

- too many nodes with weak separation,
- the orchestrator doing all the real thinking,
- workers returning prose without usable artifacts,
- repeated rereading of the same source material,
- shared memory filling with low-quality notes,
- final outputs with weak provenance.

## Recommended Artifact Per Harness

Each harness should have a compact eval document with:

- target workflows,
- chosen pattern and why,
- handoff artifacts,
- success criteria,
- likely failure classes,
- cost and latency expectations,
- notes on when a simpler harness would be better.
