# AGENTS.md

## Scope

- This repository is a read-only KASB standards product, not a generic
  Markdown guide.
- The approved target follows the `../ytm` Rust/Node boundary: one public Rust
  SDK owns KASB HTTP and domain behavior; a narrow asynchronous Node-API binding
  supports the Node SDK, while a separate Rust `clap` crate owns the CLI.
- The npm `kasb` entrypoint is only a platform resolver and process launcher for
  the packaged Rust CLI binary. It must not become a second CLI implementation.
- [MIGRATION.md](MIGRATION.md) records the completed rewrite decision.
- The Pi adapter is retired and must not be replaced
  by MCP or another host adapter without a product decision.

## Read First

1. Start with [README.md](README.md).
2. Read [MIGRATION.md](MIGRATION.md) for the completed rewrite decision.
3. Read [ARCHITECTURE.md](ARCHITECTURE.md) for current boundaries.
4. Read [VISION.md](VISION.md) for product scope and non-goals.
5. Read [docs/research/kasb-standard-source-map.md](docs/research/kasb-standard-source-map.md)
   before changing provider assumptions.
6. Read [docs/specs/kasb-standards-v1.md](docs/specs/kasb-standards-v1.md)
   before changing public capability semantics.
7. Read [plans/rust-node-rewrite.md](plans/rust-node-rewrite.md) before changing
   a cutover-established compatibility or distribution boundary.

## Current Commands

- Install dependencies: `bun install --frozen-lockfile`
- Validate contract authorities and fixture freshness: `bun run contracts:check`
- Run the adversarial public-surface judge: `bun run conformance:judge`
- Run the native binding and launcher feasibility proof: `bun run native:feasibility`
- Typecheck: `bun run typecheck`
- Test the Rust and Node products: `bun run test`
- Build the Rust and Node products: `bun run build`
- Check Rust formatting: `cargo fmt --all --check`
- Check Rust lints: `cargo clippy --locked --workspace --all-targets -- -D warnings`
- Run opt-in live checks: `bun run test:live`

Document only commands that exist in `package.json` or Cargo metadata. Update
this list when the rewrite changes the repository interface.

## CLI Tryouts

- Use `cargo run --locked -p kasb-cli --bin kasb -- --help` for the direct Rust
  CLI.
- Use `cargo run --locked -p kasb-cli --bin kasb -- help <command>` for
  command-specific usage.
- After `bun run build:node`, use `node packages/node/dist/cli.js --help` to
  exercise the npm launcher path with an installed native package.

## Document Ownership

- Product scope and non-goals: `VISION.md`
- Current system boundaries: `ARCHITECTURE.md`
- Rewrite decision and superseded direction: `MIGRATION.md`
- Completed rewrite execution record: `plans/rust-node-rewrite.md`
- Provider evidence: `docs/research/kasb-standard-source-map.md`
- Public semantic contract: `docs/specs/kasb-standards-v1.md`
- Project order and unscheduled work: `ROADMAP.md`

## Working Rules

- Keep each durable concern in one canonical document and link to it instead of
  repeating it.
- Keep `crates/kasb` public and independent of Node-API types.
- Keep KASB URLs, headers, transport policy, source decoding, normalization,
  and domain failures in Rust.
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
