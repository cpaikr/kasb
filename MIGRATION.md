# Rust/Node Rewrite Decision

Status: approved for planning; implementation not started.

Decision date: 2026-08-22.

## Decision

Replace the additive dual-conformer direction with one public Rust SDK that owns
all KASB HTTP and domain behavior. Build a separate Rust `clap` CLI over that
SDK, and expose the SDK to Node through a narrow asynchronous Node-API binding
and thin Node facade. Keep npm installation of `kasb` as a transparent launcher
for the packaged Rust CLI binary.

Retain:

- the public `kasb` Rust crate;
- the npm package identity;
- the Rust `kasb` CLI, including npm installation through a thin launcher;
- the Node SDK;
- `@sjunepark/kasb/toolset`;
- approved v1 operation and serialized semantics; and
- independently authored fixtures and conformance evidence.

Retire at cutover:

- the TypeScript KASB HTTP, source-decoding, normalization, and capability
  conformer;
- the TypeScript/JavaScript CLI parser, renderer, and command behavior; and
- the Pi export, extension entrypoint, registration metadata, tests, and active
  documentation.

No replacement Pi, MCP, or host-specific adapter is part of the rewrite.

## Why the direction changed

The completed `get-paragraph` pilot proved that the public Rust crate can own
the real KASB path with typed failures, cancellation, source normalization, and
the pinned `wreq` persona. Keeping a second TypeScript conformer would duplicate
wire and source rules and preserve two places for source drift.

The replacement follows the proven `../ytm` shape and the accepted `../mytech`
preferences:

- Rust is the default external HTTP protocol implementation;
- a Node product over Rust uses a narrow asynchronous Node-API binding;
- OpenAPI is the sole repository authority for supported wire behavior;
- project-owned contracts and errors cross boundaries;
- derived artifacts have named canonical inputs and freshness checks; and
- verification follows the actual path from contract and provider evidence to
  packed consumer behavior.

The npm launcher is deliberately not another CLI transport. Platform packages
contain both the Node-API addon and the exact Rust CLI binary for that release;
the launcher resolves the correct package and forwards arguments, streams,
signals, environment, working directory, and exit status without a shell. It
does not download or compile artifacts during install or first use.

KASB differs from `ytm` in one deliberate way: `crates/kasb` remains a supported
public SDK rather than an internal core. Node-API is an additional projection of
that SDK, not its owner.

## Superseded direction

Migration phases 1–4 from the former additive plan are complete and remain
useful evidence:

- language-neutral conformance cases and known-bad controls;
- the TypeScript package move and Rust workspace;
- the Rust translation rulebook and parity record; and
- the validated `get-paragraph` vertical pilot.

The former phase 5 instruction to add five capabilities while keeping an
independent TypeScript conformer is superseded. Historical evidence remains in
`docs/plans/rust-migration/` and
`goals/rust-migration-foundation-pilot.md`; those files do not define current
work or authority.

## Current authorities

- Product scope: [VISION.md](VISION.md)
- Current and target boundaries: [ARCHITECTURE.md](ARCHITECTURE.md)
- Public capability semantics: [docs/specs/kasb-standards-v1.md](docs/specs/kasb-standards-v1.md)
- Provider evidence: [docs/research/kasb-standard-source-map.md](docs/research/kasb-standard-source-map.md)
- Scheduled execution and exit gates: [plans/rust-node-rewrite.md](plans/rust-node-rewrite.md)
- Project order: [ROADMAP.md](ROADMAP.md)

## Constraints

- Do not remove the current TypeScript path before the replacement passes the
  independent cutover gates.
- Do not generate the Rust conformer from OpenAPI.
- Do not expose `wreq`, Node-API, provider payload, or panic details through
  unrelated public boundaries.
- Do not parse commands, render KASB output, or implement fallback behavior in
  the npm launcher.
- Do not raise the Node runtime floor or change public semantics without
  evidence and explicit review.
- Do not claim native npm support without native build and clean-consumer
  verification.
- Do not publish, tag a release, or mutate KASB external state without separate
  authorization.
