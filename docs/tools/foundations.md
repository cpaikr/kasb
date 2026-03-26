# Foundations

This document defines the repo's baseline for single-tool design.

## What An Agent Tool Is

An agent tool is a capability packaged so an agent can:

- recognize when to use it,
- supply valid inputs,
- get deterministic work done efficiently,
- receive results shaped for the next step,
- recover from failures without guesswork.

Tool quality is rarely decided by "can the model call it?" The harder part is designing the contract, result shape, references, safety limits, retries, and operating model around the capability.

## Default Design Order

For most durable tools, this sequence holds:

1. define the capability boundary
2. design the contract
3. implement the deterministic core
4. add tests and eval scenarios
5. expose a CLI
6. add MCP if the runtime benefits from it
7. add skills or prompt guidance

Starting from transport usually produces thin, leaky tools that are hard to test and hard to reuse.

## Standard Layers

- `core`
  Domain logic and deterministic work.
- `adapter`
  CLI, MCP, SDK, or HTTP wrapper over the core.
- `policy`
  Auth, permissions, retries, rate limits, caching, audit trail.
- `guidance`
  Skill text, examples, and usage heuristics.

The capability core should not depend on transport-specific assumptions.

## What Makes A Tool Good For Agents

- `narrow intent`
  One call should represent one meaningful action.
- `structured output`
  Return objects, tables, spans, references, and metadata instead of prose when possible.
- `progressive detail`
  Support summary, filtered, and raw access instead of forcing large dumps.
- `stable references`
  Preserve page numbers, cell ranges, document ids, paths, urls, and anchors.
- `explicit errors`
  Make invalid input, source changes, auth issues, and partial results legible.
- `deterministic behavior`
  Prefer rule-based core logic over hidden prompt-like heuristics.
- `agent-efficient abstraction`
  Return what the agent needs next, not the most literal dump of the source.

## Useful Mental Split

People often collapse four different things into "tool":

- `execution transport`
  MCP, CLI, HTTP, or in-process calls
- `capability`
  Read PDF, search filings, diff files, normalize tables
- `packaging`
  Skill text, prompt wrapper, helper agent
- `runtime policy`
  Approval, sandbox, auth, scope, retries

Keeping those separate makes design and reuse much easier.

## Tool Families

The repo should standardize principles and evaluation rules, not force one payload shape across all tools.

- `extraction tools`
  PDF, Excel, OCR, HTML-to-structured-data
- `domain access tools`
  Regulatory sites, internal APIs, knowledge systems
- `workspace tools`
  Filesystem search, read, write, move, diff, archive
- `transformation tools`
  Normalize tables, map schemas, convert formats, clean entities
- `coordination tools`
  Queue jobs, trigger workflows, batch requests, cache results

## Related Reading

- [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Building effective agents](https://www.anthropic.com/research/building-effective-agents/)
