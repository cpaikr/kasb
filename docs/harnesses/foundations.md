# Harness Foundations

## What A Harness Is

A harness is the system that composes:

- `agents`
  Bounded workers with a role, tools, policy, and a context window.
- `tools`
  External capabilities the agents can call.
- `context`
  Any input given to an agent.
- `memory`
  Information persisted for later reuse.
- `artifacts`
  Durable outputs that other agents or humans can consume.
- `handoffs`
  Structured transfers of work, context, and artifacts.
- `policy`
  Rules for delegation, tool use, memory writes, and approvals.

This repo treats harness design as a separate problem from tool design. A good tool can still perform poorly inside a bad harness.

## Default Stance

- Start from the `workflow`, not from the number of agents.
- Treat `context management` as the main design problem.
- Prefer `functional composition`: bounded inputs, bounded outputs, explicit handoffs.
- Use `agent nodes` as the default unit of composition.
- Use `shared memory` sparingly by default.
- Prefer artifacts and references over free-form inter-agent chat.
- Add a central orchestrator only when coordination complexity justifies it.

## What Makes A Harness Good

- `clear task boundaries`
  Each node should own one meaningful unit of work.
- `bounded context`
  Each agent should receive only the context it needs now.
- `traceable handoffs`
  Outputs should preserve evidence, references, and status.
- `legible coordination`
  A contributor should be able to explain how work moves.
- `policy clarity`
  Tool use, delegation, and approval boundaries should be explicit.
- `failure containment`
  One bad branch should not corrupt the whole run.
- `human operability`
  Humans should be able to inspect progress, artifacts, and decisions.

## Useful Mental Split

People often collapse several layers into "agent system":

- `workflow`
  What jobs need to happen and in what order.
- `topology`
  How nodes communicate and who controls routing.
- `context strategy`
  What enters each context window and when.
- `memory strategy`
  What gets persisted and how it is reused.
- `tool surface`
  What capabilities each agent may access.
- `policy`
  What actions are allowed, reviewed, or blocked.

Keep those separate. Most design mistakes come from mixing them.

## When To Use Multiple Agents

Multiple agents usually help when:

- one session cannot hold the necessary context,
- parallel exploration can reduce latency,
- different tasks benefit from different tools or instructions,
- you need clean separation between search, synthesis, and review,
- long-running work needs durable handoffs across sessions.

Do not add more agents just because the workflow is large. A single agent is often better when:

- the task is short and coherent,
- coordination overhead would dominate,
- the work requires tight iterative reasoning in one context,
- outputs are hard to separate cleanly.

## Related Reading

- [Building effective agents](https://www.anthropic.com/research/building-effective-agents/)
- [How we built our multi-agent research system](https://www.anthropic.com/engineering/built-multi-agent-research-system)
- [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
