# agent-design

Markdown-first guidance for designing agent tools.

This repo is not one tool implementation. It is a documentation framework for designing agent tools, with the KASB standards tool as the current concrete project:

- how to design one good agent-facing tool.

## Core Stance

- Start from the `capability` or `workflow`, not the transport or UI.
- Treat `CLI`, `MCP`, and SDKs as adapters over the same core capability.
- Optimize for structured, traceable, bounded results with explicit failure modes.
- Treat context as a scarce resource and design around that fact.

## Read In This Order

1. [VISION.md](VISION.md)
   Product-level goal and scope for the current project.
2. [ROADMAP.md](ROADMAP.md)
   Strategic sequencing from investigation to implementation.
3. [TODO.md](TODO.md)
   Ordered near-term work queue.
4. [PLAN.md](PLAN.md)
   Detailed plan for the one active job.
5. [docs/tools/foundations.md](docs/tools/foundations.md)
   Core principles for tool design.
6. Tool track:
   [docs/tools/contracts.md](docs/tools/contracts.md), [docs/tools/transport-decision.md](docs/tools/transport-decision.md), [docs/tools/evaluation.md](docs/tools/evaluation.md)
7. Templates:
   [docs/tools/templates/tool-spec-template.md](docs/tools/templates/tool-spec-template.md)
8. Relevant tool playbook in [docs/tools/playbooks/](docs/tools/playbooks/)
   Tool-family-specific guidance.

## Repo Map

- [ARCHITECTURE.md](ARCHITECTURE.md): document ownership and contributor flow
- [VISION.md](VISION.md): product vision for the current KASB standards tool
- [ROADMAP.md](ROADMAP.md): strategic direction and phased sequencing
- [TODO.md](TODO.md): ordered near-term work queue
- [PLAN.md](PLAN.md): the one active detailed plan
- [docs/research/kasb-standard-source-map.md](docs/research/kasb-standard-source-map.md): captured source evidence and request inventory for the KASB site
- [docs/specs/](docs/specs/README.md): stable capability specs once the evidence exists
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

## External References

Useful Anthropic writing that informs this repo:

- [Building effective agents](https://www.anthropic.com/research/building-effective-agents/)
- [How we built our multi-agent research system](https://www.anthropic.com/engineering/built-multi-agent-research-system)
- [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
