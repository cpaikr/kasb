# Evaluation

This document is about evaluating one tool.

## What To Evaluate

Do not stop at unit correctness.

An agent tool should be evaluated on:

- `task success`
  Does it help the agent complete the actual user task?
- `call efficiency`
  How many tool calls and retries are needed?
- `output usability`
  Does the result shape reduce model reasoning burden?
- `failure clarity`
  Can the agent recover when something goes wrong?
- `source faithfulness`
  Are references and extracted facts traceable?
- `latency`
  Is the tool fast enough to actually be preferred?

## Eval Types

### Contract tests

Verify input validation, output shape, and error codes.

### Golden extraction tests

For PDF, Excel, and site data tools, preserve canonical fixtures and expected outputs.

### Scenario evals

Use user-like tasks:

- "Find the latest audit opinion in this filing and quote the exact section reference."
- "Extract the revenue table from sheet 3 and normalize headers."
- "Find all subsidiaries named in this annual report and give page references."

### Adversarial evals

Probe:

- weird encodings,
- merged cells,
- scanned PDFs,
- rate-limited websites,
- stale cookies,
- hidden anti-bot flows,
- symlink or path traversal attempts.

## Measure Agent Burden

A tool can be technically correct and still poor for agents.

Watch for:

- too much raw text,
- unclear field naming,
- missing references,
- outputs that require the model to infer table structure,
- outputs that hide uncertainty.

## Recommended Artifact Per Tool

Each future tool should have a compact eval document with:

- target tasks,
- success criteria,
- representative fixtures,
- known failure classes,
- benchmark expectations,
- version notes when the upstream source changes.
