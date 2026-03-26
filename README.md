# agent-design

Markdown-first guidance for designing agent tools and agent harnesses.

This repo is not one tool implementation. It is a documentation framework for two related problems:

- how to design one good agent-facing tool,
- how to compose multiple agents, tools, context, memory, and handoffs into an effective harness.

## Core Stance

- Start from the `capability` or `workflow`, not the transport or UI.
- Treat `CLI`, `MCP`, and SDKs as adapters over the same core capability.
- Treat the harness as a first-class design surface, not glue code around a model.
- Optimize for structured, traceable, bounded results with explicit failure modes.
- Treat context as a scarce resource and design around that fact.

Most durable systems split into two layers of design:

1. single-tool design
2. multi-agent harness design

## Read In This Order

1. [docs/tools/foundations.md](docs/tools/foundations.md) and [docs/harnesses/foundations.md](docs/harnesses/foundations.md)
   Core principles for tools and harnesses.
2. Tool track:
   [docs/tools/contracts.md](docs/tools/contracts.md), [docs/tools/transport-decision.md](docs/tools/transport-decision.md), [docs/tools/evaluation.md](docs/tools/evaluation.md)
3. Harness track:
   [docs/harnesses/patterns.md](docs/harnesses/patterns.md), [docs/harnesses/context.md](docs/harnesses/context.md), [docs/harnesses/memory.md](docs/harnesses/memory.md), [docs/harnesses/lifecycle.md](docs/harnesses/lifecycle.md), [docs/harnesses/evaluation.md](docs/harnesses/evaluation.md)
4. Templates:
   [docs/tools/templates/tool-spec-template.md](docs/tools/templates/tool-spec-template.md), [docs/harnesses/templates/harness-spec-template.md](docs/harnesses/templates/harness-spec-template.md)
5. Relevant tool playbook in [docs/tools/playbooks/](docs/tools/playbooks/)
   Tool-family-specific guidance.

## Repo Map

- [ARCHITECTURE.md](ARCHITECTURE.md): document ownership and contributor flow
- [docs/tools/foundations.md](docs/tools/foundations.md): what makes a good agent tool
- [docs/tools/contracts.md](docs/tools/contracts.md): input, output, references, and errors
- [docs/tools/transport-decision.md](docs/tools/transport-decision.md): when to use CLI, MCP, or both
- [docs/tools/evaluation.md](docs/tools/evaluation.md): how to measure real tool usefulness
- [docs/tools/lifecycle.md](docs/tools/lifecycle.md): recommended tool build sequence
- [docs/tools/portfolio.md](docs/tools/portfolio.md): shared conventions across a tool portfolio
- [docs/tools/playbooks/pdf-tool.md](docs/tools/playbooks/pdf-tool.md): PDF tool guidance
- [docs/tools/playbooks/excel-tool.md](docs/tools/playbooks/excel-tool.md): spreadsheet tool guidance
- [docs/tools/playbooks/site-data-tool.md](docs/tools/playbooks/site-data-tool.md): site/API data tool guidance
- [docs/tools/playbooks/filesystem-tool.md](docs/tools/playbooks/filesystem-tool.md): workspace tool guidance
- [docs/tools/templates/tool-spec-template.md](docs/tools/templates/tool-spec-template.md): spec template for new tools
- [docs/harnesses/foundations.md](docs/harnesses/foundations.md): what a harness is and what it is made of
- [docs/harnesses/patterns.md](docs/harnesses/patterns.md): common multi-agent composition patterns
- [docs/harnesses/context.md](docs/harnesses/context.md): context engineering for harnesses
- [docs/harnesses/memory.md](docs/harnesses/memory.md): memory, artifacts, and progress persistence
- [docs/harnesses/lifecycle.md](docs/harnesses/lifecycle.md): recommended harness design sequence
- [docs/harnesses/evaluation.md](docs/harnesses/evaluation.md): how to measure harness usefulness
- [docs/harnesses/templates/harness-spec-template.md](docs/harnesses/templates/harness-spec-template.md): spec template for new harnesses

## External References

Useful Anthropic writing that informs this repo:

- [Building effective agents](https://www.anthropic.com/research/building-effective-agents/)
- [How we built our multi-agent research system](https://www.anthropic.com/engineering/built-multi-agent-research-system)
- [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
