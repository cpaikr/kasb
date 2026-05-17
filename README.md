# kasb-standards

Read-only KASB standards CLI, following the app design used in `../darty`.

The product provides a Bun/TypeScript capability core for `https://db.kasb.or.kr/api/` and a thin Commander CLI for local and agent use.

Current status: the first CLI implementation exists with fixture-backed standards search, structure lookup, section retrieval, paragraph retrieval, Q&A search, and Q&A document retrieval. Hardening and review fixes are in progress.

KASB public API behavior can drift. Keep source claims evidence-backed and update the research note when live behavior changes.

## Core Stance

- The CLI is the only planned public interface.
- The capability layer is the real app; the CLI is a thin transport over it.
- Follow `../darty`'s layer split: CLI transport -> app composition -> capability contract/execution -> source adapter.
- Optimize for structured, traceable, bounded results with typed failures.
- Make CLI success and failure output parseable JSON for subprocess callers.
- Keep KASB source details explicit before adding higher-level abstractions.
- Treat context as scarce: return stable references and progressive detail instead of giant dumps.

## Read In This Order

1. [ARCHITECTURE.md](ARCHITECTURE.md)
   Target repo shape, document ownership, and Darty-parity implementation boundaries.
2. [VISION.md](VISION.md)
   Product goal, scope, principles, and non-goals.
3. [docs/research/kasb-standard-source-map.md](docs/research/kasb-standard-source-map.md)
   Observed KASB API behavior, identifier spaces, and replay evidence.
4. [docs/specs/kasb-standards-v1.md](docs/specs/kasb-standards-v1.md)
   v1 capability contract.
5. [TODO.md](TODO.md)
   Ordered near-term queue.
6. [PLAN.md](PLAN.md)
   Active detailed implementation plan.
7. [docs/tools/foundations.md](docs/tools/foundations.md)
   Shared tool design principles.

For historical planning context, see [ROADMAP.md](ROADMAP.md) and [PRMOPT.md](PRMOPT.md).

## Repo Map

- [AGENTS.md](AGENTS.md): instructions for coding agents working in this repo
- [ARCHITECTURE.md](ARCHITECTURE.md): implemented system shape, ownership boundaries, and Darty-parity architecture
- [VISION.md](VISION.md): product vision for `kasb-standards`
- [PRMOPT.md](PRMOPT.md): historical implementation choices and stack decision brief
- [ROADMAP.md](ROADMAP.md): historical phased direction from docs to implementation
- [TODO.md](TODO.md): ordered near-term queue
- [PLAN.md](PLAN.md): one active detailed plan
- [docs/research/kasb-standard-source-map.md](docs/research/kasb-standard-source-map.md): captured source evidence and request inventory
- [docs/specs/kasb-standards-v1.md](docs/specs/kasb-standards-v1.md): v1 capability contract
- [docs/specs/](docs/specs/README.md): stable capability specs
- [docs/tools/](docs/tools/foundations.md): shared tool-design guidance

## Commands

- Install deps: `bun install`
- Typecheck: `bun run typecheck`
- Test: `bun test`
- Build npm CLI: `bun run build`
- Live checks: `bun run test:live`

## Implementation Roots

```text
src/                    reusable capability core, CLI, source adapters
fixtures/               captured KASB API responses for deterministic tests
test/                   CLI, fixture-backed, and opt-in live checks
evals/                  later agent/task evals after CLI behavior stabilizes
```

The implementation follows [ARCHITECTURE.md](ARCHITECTURE.md).

## External References

Useful Anthropic writing that informs this repo:

- [Building effective agents](https://www.anthropic.com/research/building-effective-agents)
- [How we built our multi-agent research system](https://www.anthropic.com/engineering/built-multi-agent-research-system)
- [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
