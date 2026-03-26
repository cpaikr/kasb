# Architecture

This repo is a documentation system for future tool and harness implementations. The architecture is the document boundary: each file should own one layer of the design, and shared guidance should live in exactly one canonical place.

## Document Ownership

- [README.md](README.md)
  Orientation, repo stance, and reading order.
- [docs/tools/](docs/tools/)
  Canonical home for single-tool design.
- [docs/tools/foundations.md](docs/tools/foundations.md)
  Core principles for designing agent tools.
- [docs/tools/contracts.md](docs/tools/contracts.md)
  Operation shape, inputs, outputs, references, and errors.
- [docs/tools/transport-decision.md](docs/tools/transport-decision.md)
  How to choose CLI, MCP, SDK, or more than one.
- [docs/tools/evaluation.md](docs/tools/evaluation.md)
  Scenario-driven tool quality criteria and failure testing.
- [docs/tools/lifecycle.md](docs/tools/lifecycle.md)
  Build sequence from problem definition to stable tool.
- [docs/tools/portfolio.md](docs/tools/portfolio.md)
  Cross-tool conventions and shared substrate.
- [docs/tools/playbooks/](docs/tools/playbooks/)
  Tool-family-specific guidance that extends, rather than repeats, the shared tool docs.
- [docs/tools/templates/](docs/tools/templates/)
  Reusable structure for future tool specs.
- [docs/specs/](docs/specs/)
  Concrete tool and investigation plans for specific capabilities.
- [docs/harnesses/](docs/harnesses/)
  Canonical home for multi-agent harness design.
- [docs/harnesses/foundations.md](docs/harnesses/foundations.md)
  Harness primitives, boundaries, and default stance.
- [docs/harnesses/patterns.md](docs/harnesses/patterns.md)
  Reusable topology and communication patterns.
- [docs/harnesses/context.md](docs/harnesses/context.md)
  Context engineering guidance for harnesses.
- [docs/harnesses/memory.md](docs/harnesses/memory.md)
  Memory, artifacts, and persistence guidance.
- [docs/harnesses/lifecycle.md](docs/harnesses/lifecycle.md)
  Build sequence from workflow definition to stable harness.
- [docs/harnesses/evaluation.md](docs/harnesses/evaluation.md)
  Scenario-driven harness quality criteria and failure testing.
- [docs/harnesses/templates/](docs/harnesses/templates/)
  Reusable structure for future harness specs.

## Contributor Flow

1. Start with [README.md](README.md).
2. If the work is about one capability, start in [docs/tools/foundations.md](docs/tools/foundations.md).
3. If the work is about composing multiple agents, start in [docs/harnesses/foundations.md](docs/harnesses/foundations.md).
4. Write or update the relevant spec with [docs/tools/templates/tool-spec-template.md](docs/tools/templates/tool-spec-template.md) or [docs/harnesses/templates/harness-spec-template.md](docs/harnesses/templates/harness-spec-template.md).
5. Put capability-specific plans and scoped specs in [docs/specs/](docs/specs/).
6. Keep tool rules in the tool docs and harness rules in the harness docs; link across families instead of duplicating guidance.

## Invariants

- Keep single-tool philosophy in [docs/tools/foundations.md](docs/tools/foundations.md), not scattered across the repo.
- Keep harness philosophy in [docs/harnesses/foundations.md](docs/harnesses/foundations.md), not scattered across the repo.
- Keep tool contract rules in [docs/tools/contracts.md](docs/tools/contracts.md); playbooks should only add family-specific constraints.
- Keep harness pattern selection in [docs/harnesses/patterns.md](docs/harnesses/patterns.md), not copied into every harness doc.
- Keep context guidance in [docs/harnesses/context.md](docs/harnesses/context.md) and memory guidance in [docs/harnesses/memory.md](docs/harnesses/memory.md).
- Keep repo structure and document ownership here, not in the topic docs.
- Prefer links to canonical guidance over repeating the same rule in multiple files.

## Future Expansion

If implementations are added later, preserve the same split:

- `spec/` or `docs/specs/` for stable capability or harness specs
- `libs/` or `packages/` for capability cores
- `adapters/` for CLI, MCP, SDK, or HTTP exposure
- `harnesses/` or `workflows/` for runtime composition and orchestration code
- `evals/` for scenario-driven tests and transcripts
