# AGENTS.md

## Scope

- This repository is a read-only KASB standards product, not a generic
  Markdown guide.
- The approved target follows the `../ytm` Rust/Node boundary: one public Rust
  SDK owns KASB HTTP and domain behavior; a narrow asynchronous Node-API binding
  supports the Node SDK, while a separate Rust `clap` crate owns the CLI.
- The npm `kasb` entrypoint is only a platform resolver and process launcher for
  the packaged Rust CLI binary. It must not become a second CLI implementation.
- The Rust `get-paragraph` pilot and the complete TypeScript product currently
  coexist during the transition. Do not describe target paths as implemented.
- The Pi adapter is intentionally retired at cutover and must not be replaced
  by MCP or another host adapter without a product decision.

## Read First

1. Start with [README.md](README.md).
2. Read [ARCHITECTURE.md](ARCHITECTURE.md) for current and target boundaries.
3. Read [VISION.md](VISION.md) for product scope and non-goals.
4. Read [docs/research/kasb-standard-source-map.md](docs/research/kasb-standard-source-map.md)
   before changing provider assumptions.
5. Read [docs/specs/kasb-standards-v1.md](docs/specs/kasb-standards-v1.md)
   before changing public capability semantics.
6. Read [plans/rust-node-rewrite.md](plans/rust-node-rewrite.md) before rewrite
   implementation or cutover work.

## Current Commands

- Install dependencies: `bun install --frozen-lockfile`
- Validate contract authorities and fixture freshness: `bun run contracts:check`
- Run the adversarial public-surface judge: `bun run conformance:judge`
- Run the native binding and launcher feasibility proof: `bun run native:feasibility`
- Typecheck: `bun run typecheck`
- Test both implementations: `bun run test`
- Build both implementations: `bun run build`
- Check Rust formatting: `cargo fmt --all --check`
- Check Rust lints: `cargo clippy --locked --workspace --all-targets -- -D warnings`
- Run opt-in live checks: `bun run test:live`

Document only commands that exist in `package.json` or Cargo metadata. Update
this list when the rewrite changes the repository interface.

## Current CLI Tryouts

- Use `bun packages/kasb-ts/src/cli.ts --help` before the cutover.
- Use `bun packages/kasb-ts/src/cli.ts help <command>` for command-specific
  usage.
- After `bun run build`, use `node packages/kasb-ts/dist/cli.js --help` to test
  the packaged entrypoint.

## Document Ownership

- Product scope and non-goals: `VISION.md`
- Current and target system boundaries: `ARCHITECTURE.md`
- Rewrite decision and superseded direction: `MIGRATION.md`
- Scheduled execution detail: `plans/rust-node-rewrite.md`
- Provider evidence: `docs/research/kasb-standard-source-map.md`
- Public semantic contract: `docs/specs/kasb-standards-v1.md`
- Project order and unscheduled work: `ROADMAP.md`

## Working Rules

- Keep each durable concern in one canonical document and link to it instead of
  repeating it.
- Keep `crates/kasb` public and independent of Node-API types.
- Keep KASB URLs, headers, transport policy, source decoding, normalization,
  and domain failures in Rust after cutover.
- Keep the Node binding project-owned, asynchronous, cancellation-aware, and
  free of raw dependency or panic details.
- Keep the Node SDK/toolset wire-ignorant; it owns JavaScript ergonomics and
  network-free discovery/validation only.
- Keep CLI parsing, help, presentation, stdout/stderr, and exit behavior in the
  Rust `clap` crate. The npm launcher only forwards the process contract.
- Public JSON uses camelCase fields; CLI flags use kebab-case.
- Preserve source-native identifiers internally unless the v1 spec promotes
  them into the public contract.
- Mark provider claims as observed, inferred, or unverified when the distinction
  affects behavior.
- Keep fixtures and expected results independent from the implementation and
  retain adversarial controls proving that the judge detects wrong behavior.
- Do not claim an npm native target until native build and clean packed-consumer
  tests pass for it.
- Keep live checks separate from deterministic merge validation.
- Do not publish packages, create release tags, or mutate KASB external state
  without explicit authorization.
