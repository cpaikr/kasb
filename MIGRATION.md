# Rust/Node Rewrite Decision

Status: complete. Cutover merged by PR #19; publication remains disabled.

Decision date: 2026-08-22.

## Completed state

The canonical product is the public Rust SDK, the Rust `clap` CLI, and the
Rust-backed Node SDK/toolset. npm `kasb` resolves an exact-version platform
package and transparently launches its same-revision Rust CLI binary. The
TypeScript conformer, JavaScript CLI implementation, and Pi surface are
removed.

Linux GNU x64/ARM64, macOS ARM64, and Windows x64 passed their native build,
artifact, direct-CLI, and clean-consumer gates. Linux GNU targets require glibc
2.28. Windows preserves the launcher process contract without promising POSIX
signal identity. Continuous CI now validates only Linux GNU x64/ARM64 on
Blacksmith to reduce compute cost; macOS ARM64 and Windows x64 remain supported
from their recorded cutover evidence but are not continuously tested. Contained
native panics expose only a public
`internal_failure` and the sanitized `sjunepark.kasb.native`
`{ "code": "binding_panic" }` diagnostics event.

The phase history and detailed validation evidence are maintained in
[plans/rust-node-rewrite.md](plans/rust-node-rewrite.md).

## Decision

One public Rust SDK owns all KASB HTTP, decoding, normalization, and domain
behavior. A separate Rust `clap` CLI uses that SDK. A narrow asynchronous
Node-API binding and thin JavaScript facade expose the SDK to Node. The npm
executable is a shell-free platform resolver and process launcher, not another
CLI implementation.

Retained:

- the public `kasb` Rust crate;
- the npm `@sjunepark/kasb` identity and `kasb` executable;
- the Rust CLI and Rust-backed Node SDK;
- `@sjunepark/kasb/toolset`;
- approved v1 operations and serialized semantics; and
- independently authored fixtures and conformance evidence.

Retired:

- TypeScript KASB HTTP, source decoding, normalization, and capability
  execution;
- TypeScript/JavaScript CLI parsing, rendering, and command behavior; and
- the Pi export, entrypoint, registration metadata, tests, and active docs.

No Pi, MCP, or replacement host adapter is part of this decision.

## Rationale

The Rust pilot proved typed failures, cancellation, source normalization, and
the pinned `wreq` persona on the real KASB path. Keeping a second TypeScript
conformer would duplicate wire and source rules. OpenAPI therefore remains the
sole repository authority for supported wire facts, while the v1 spec owns
public semantics and provider research and fixtures remain independent
evidence.

The platform packages contain the Node addon and exact same-revision Rust CLI.
The launcher forwards arguments, environment, working directory, standard
streams, termination, and exit status without downloading, compiling, parsing
commands, or rendering KASB output. On Windows, Node exposes forceful
termination rather than POSIX signal identity. Both Linux GNU artifacts are
built and checked against the glibc 2.28 floor.

KASB deliberately keeps `crates/kasb` as a supported public SDK rather than an
internal Node implementation detail.

## Superseded direction

The former additive dual-conformer plan is superseded. Its language-neutral
cases, package migration, translation rules, and vertical-pilot evidence remain
under `docs/plans/rust-migration/` and
`goals/rust-migration-foundation-pilot.md`; they are historical, not current
authority.

## Authorities

- Product scope: [VISION.md](VISION.md)
- Current boundaries: [ARCHITECTURE.md](ARCHITECTURE.md)
- Public semantics: [docs/specs/kasb-standards-v1.md](docs/specs/kasb-standards-v1.md)
- Provider evidence: [docs/research/kasb-standard-source-map.md](docs/research/kasb-standard-source-map.md)
- Completed execution and gates: [plans/rust-node-rewrite.md](plans/rust-node-rewrite.md)
- Project order: [ROADMAP.md](ROADMAP.md)

## Constraints

- Do not generate the Rust conformer from OpenAPI.
- Do not expose `wreq`, Node-API, provider payload, or panic details through
  unrelated public boundaries.
- Do not add command parsing, rendering, downloads, compilation, or fallback
  behavior to the npm launcher.
- Do not change public semantics or native support claims without evidence and
  explicit review.
- Do not publish, select a version, create a release tag, or mutate KASB
  external state without separate authorization.
