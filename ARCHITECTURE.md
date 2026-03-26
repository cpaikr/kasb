# Architecture

This repo is a documentation system for future tool implementations. The architecture is the document boundary: each file should own one layer of the design, and shared guidance should live in exactly one canonical place.

## Document Ownership

- [README.md](README.md)
  Orientation, repo stance, and reading order.
- [VISION.md](VISION.md)
  Product-level goal, scope, and non-goals for the current project.
- [plans/](plans/README.md)
  Active investigations, phased work, and pre-spec planning.
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
  Stable, evidence-backed capability specs.

## Contributor Flow

1. Start with [README.md](README.md).
2. If the work is about the current product, read [VISION.md](VISION.md) first.
3. Use [docs/tools/foundations.md](docs/tools/foundations.md) and the linked tool docs to shape the design.
4. Put open-ended investigation and phased planning in [plans/](plans/README.md).
5. Promote only evidence-backed, implementation-ready capability specs into [docs/specs/](docs/specs/README.md).
6. Keep tool rules in the tool docs; link to canonical guidance instead of duplicating it.

## Invariants

- Keep product vision at the repo root, not mixed into specs or plans.
- Keep unstable planning material in `plans/`, not `docs/specs/`.
- Keep single-tool philosophy in [docs/tools/foundations.md](docs/tools/foundations.md), not scattered across the repo.
- Keep tool contract rules in [docs/tools/contracts.md](docs/tools/contracts.md); playbooks should only add family-specific constraints.
- Keep repo structure and document ownership here, not in the topic docs.
- Prefer links to canonical guidance over repeating the same rule in multiple files.

## Future Expansion

If implementations are added later, preserve the same split:

- `spec/` or `docs/specs/` for stable capability specs
- `libs/` or `packages/` for capability cores
- `adapters/` for CLI, MCP, SDK, or HTTP exposure
- `evals/` for scenario-driven tests and transcripts
