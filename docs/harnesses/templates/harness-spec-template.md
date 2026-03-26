# Harness Spec Template

Use this for each future harness. Fill it alongside [../foundations.md](../foundations.md), [../patterns.md](../patterns.md), [../context.md](../context.md), [../memory.md](../memory.md), and [../evaluation.md](../evaluation.md).

## 1. Identity

- `name`
- `owner`
- `status`
- `users`
- `target workflow`

## 2. Problem

- What workflow does this harness support?
- Why is a single-agent session insufficient?
- Why is this harness worth standardizing?

## 3. Workflow Boundary

- What the harness does
- What the harness explicitly does not do
- What external systems or humans it depends on

## 4. Topology

- chosen pattern
- why this pattern fits
- whether there is an orchestrator
- main node types

## 5. Nodes

For each node:

- `name`
- `role`
- `inputs`
- `outputs`
- `tools`
- `policy`
- `failure cases`

## 6. Context Strategy

- static context
- retrieved context
- inherited context
- runtime context
- context budget rules

## 7. Memory And Artifacts

- progress memory
- artifact store
- shared memory surfaces
- write authority
- retrieval rules

## 8. Handoffs

- artifact shape
- required references
- validation rules
- retry or escalation path

## 9. Human Intervention

- approval points
- review checkpoints
- override or correction paths

## 10. Evaluation Plan

- target workflows
- success criteria
- handoff tests
- context failure tests
- long-running continuity tests
- cost and latency budget

## 11. Open Questions

- unresolved topology decisions
- context or memory risks
- likely future extensions
