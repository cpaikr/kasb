# agent-design

Implementation-first work on the KASB standards tool and scraper, with supporting design docs kept in the same repo.

This repo now has two concrete targets:

- a reusable KASB access tool for typed search and retrieval against `https://db.kasb.or.kr/api/`
- a scraper that uses that tool and persists retrievable data into a database

## Core Stance

- Start from the `capability` or `workflow`, not the transport or UI.
- Treat `CLI`, `MCP`, and SDKs as adapters over the same core capability.
- Optimize for structured, traceable, bounded results with explicit failure modes.
- Treat context as a scarce resource and design around that fact.

## Read In This Order

1. [ARCHITECTURE.md](ARCHITECTURE.md)
   System shape, ownership boundaries, and target repo layout.
2. [VISION.md](VISION.md)
   Product-level goal and scope for the current project.
3. [docs/specs/kasb-standards-v1.md](docs/specs/kasb-standards-v1.md)
   Current contract target for the reusable KASB tool.
4. [PRMOPT.md](PRMOPT.md)
   Active implementation discussion about stack, tooling, and viable build paths.
5. [ROADMAP.md](ROADMAP.md)
   Strategic sequencing from investigation into implementation.
6. [TODO.md](TODO.md)
   Ordered near-term work queue.
7. [PLAN.md](PLAN.md)
   Detailed plan for the one active job.
8. [docs/tools/foundations.md](docs/tools/foundations.md)
   Core principles for tool design.
9. Tool track:
   [docs/tools/contracts.md](docs/tools/contracts.md), [docs/tools/transport-decision.md](docs/tools/transport-decision.md), [docs/tools/evaluation.md](docs/tools/evaluation.md)
10. Templates:
   [docs/tools/templates/tool-spec-template.md](docs/tools/templates/tool-spec-template.md)
11. Relevant tool playbook in [docs/tools/playbooks/](docs/tools/playbooks/)
   Tool-family-specific guidance.

## Repo Map

- [ARCHITECTURE.md](ARCHITECTURE.md): system shape, ownership boundaries, and target repo layout
- [VISION.md](VISION.md): product vision for the current KASB standards tool
- [PRMOPT.md](PRMOPT.md): working brief for implementation choices and stack discussion
- [ROADMAP.md](ROADMAP.md): strategic direction and phased sequencing
- [TODO.md](TODO.md): ordered near-term work queue
- [PLAN.md](PLAN.md): the one active detailed plan
- [docs/research/kasb-standard-source-map.md](docs/research/kasb-standard-source-map.md): captured source evidence and request inventory for the KASB site
- [docs/specs/kasb-standards-v1.md](docs/specs/kasb-standards-v1.md): v1 contract target for the reusable KASB tool
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
