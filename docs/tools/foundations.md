# Foundations

This document defines the repo's baseline for single-tool design. The target
runtime ownership and transport shape are defined in the root architecture and
follow the proven Rust/Node boundary in `../ytm`.

This is design reference, not a product roadmap. The public product is the Rust
SDK, Rust CLI, and Rust-backed Node SDK/toolset described in the root docs and
v1 spec. npm exposes the Rust CLI through a transparent launcher.

## What An Agent Tool Is

An agent tool is a capability packaged so an agent can:

- recognize when to use it
- supply valid inputs
- get deterministic work done efficiently
- receive results shaped for the next step
- recover from failures without guesswork

Tool quality is rarely decided by "can the model call it?" The harder part is designing the contract, result shape, references, safety limits, retries, and operating model around the capability.

## Default Design Order

For durable source-backed tools, this sequence holds:

1. define the capability boundary
2. investigate the live source
3. design the public contract
4. implement the deterministic core
5. add tests and eval scenarios
6. expose a CLI
7. add other transports only when the product explicitly needs them
8. add skills or prompt guidance

Starting from transport usually produces thin, leaky tools that are hard to test and hard to reuse.

## Standard Layers

- `transport`
  CLI, MCP, SDK, HTTP wrapper, or in-process host.
- `app composition`
  Operation names, schemas, and default provider wiring shared across transports.
- `capability`
  Public semantic request/result contracts, validation, typed failures, and execution.
- `source adapter`
  KASB API URLs, source schemas, fetchers, parsers/normalizers, and source error mapping.
- `policy`
  Auth, permissions, retries, rate limits, caching, audit trail.
- `guidance`
  Skill text, examples, and usage heuristics.

The capability core should not depend on transport-specific assumptions.

## What Makes A Tool Good For Agents

- `narrow intent`
  One call should represent one meaningful action.
- `structured output`
  Return objects, records, references, and metadata instead of prose when possible.
- `progressive detail`
  Support summary, structured, and raw access instead of forcing large dumps.
- `stable references`
  Preserve standard numbers, section ids, paragraph numbers, source URLs, and parent paths.
- `explicit errors`
  Make invalid input, source changes, unavailable sources, and partial results legible.
- `deterministic behavior`
  Prefer rule-based core logic over hidden prompt-like heuristics.
- `agent-efficient abstraction`
  Return what the agent needs next, not the most literal dump of the source.

## Useful Mental Split

People often collapse four different things into "tool":

- `execution transport`
  CLI, MCP, HTTP, or in-process calls
- `capability`
  Search standards, fetch sections, and retrieve paragraphs
- `packaging`
  npm package, CLI entrypoint, skill text, prompt wrapper, helper agent
- `runtime policy`
  Approval, sandbox, auth, scope, retries, freshness

Keeping those separate makes design and reuse much easier.

## Related Reading

- [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Building effective agents](https://www.anthropic.com/research/building-effective-agents)
