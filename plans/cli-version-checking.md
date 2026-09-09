# Add cached CLI version advisories

Status: complete (2026-09-08). Implementation, bounded review, documentation
harmonization, and host validation passed. The subsequent
[release task](../tasks/release-cli-version-checking.md) completed cross-platform
validation and publication.

## Outcome and decision

Adopted the accepted [mytech guidance](../../mytech/practices/cli-version-checking.md):
successful CLI content operations evaluate cached release evidence for humans,
agents, pipes, and CI, with bounded foreground latency and explicit opt-outs.
`version-check` reports evidence for every installation. Primary results, exits,
installation ownership, and the single-document JSON contract are preserved;
no automatic installation or detached release refresh was introduced.

This replaces the ordinary-command check prohibition in the completed
[managed-upgrade record](release-contract-and-managed-upgrades.md). Current
schema, examples, timings, cache paths, and guidance belong to the
[CLI contract](../crates/kasb-cli/README.md); SDK semantics remain unchanged.
[Release posture](../docs/release.md) owns publication status. The published
v0.3.3 artifact is unchanged.

## Implementation

- `release.rs` owns manifest-derived release policy, complete bounded semantic
  selection, canonical pagination, and shared metadata transport. The updater
  uses fresh discovery and revalidates the exact selected release before
  downloading; its existing ownership gates and check-result fields remain.
- `version_check.rs` evaluates typed comparison, freshness, distribution, and
  qualified installation guidance against the running executable. The newest
  incomplete release stays selected with bounded asset/reason evidence.
- `version_cache.rs` stores disposable validated observations and failed-attempt
  times under a repository/channel/target key. It uses nonblocking OS locks,
  atomically published lock headers, atomic record replacement, and bounded
  reads with symlink defenses. Cancellation/deadline checks guard local workers.
- CLI parsing handles global flag/environment opt-outs and explicit reporting
  before KASB client construction. Successful output is projected before any
  advisory work and serialized once. Failure/help/version paths remain local
  to their existing responsibilities.
- The CLI-local schema, complete response examples, release fixtures, and
  adversarial process checks are independent of the six-operation semantic
  judge. The latter opts out explicitly and retains exact-envelope matching.
- Package consumers exercise explicit reports and successful fixture-backed
  advisories through the unchanged npm launcher. No SDK, addon, toolset, or
  JavaScript launcher acquired release logic.

`fs2` supplies crash-released portable locks because Rust 1.88 predates standard
library file locking. Existing `tempfile` facilities provide same-directory
atomic publication; Unix `rustix` flags prevent leaf-link/FIFO following.

## Acceptance evidence

| Concern | Evidence |
| --- | --- |
| Stable identity and complete discovery | Release unit tests and loopback process cases cover semantic order, backport publication, excluded tags, retired versions, absence, duplicate identities, multiple pages, full terminal pages, exhaustion, redirects, malformed/oversized responses, and canonical URLs. |
| Honest distribution | Fixtures cover mutable releases, missing/duplicate assets, bad URLs and sizes, unsupported targets, and no fallback or archive download during reporting. |
| Cache lifecycle and cost | Cold/warm/stale reports, failed refresh/cooldown/forced refresh, unchanged observation time, current-version comparison, rollback clocks, unavailable roots, foreign/corrupt/oversized records, nonblocking contention, concurrent initialization, crashed owners, and cancelled disk workers are tested. |
| Output and exclusions | All content commands and supported projections preserve primary fields, one newline-terminated JSON document, empty stderr, and exits. Tests cover flag/exact-env precedence, quiet fresh states, initialization/provider/render/input failures, help, exact version, and schema/primary/process corruption controls. |
| Cancellation | Rust tests cover the token after primary success and cancelled disk publication. Packaged-process tests cover native primary SIGINT/SIGTERM, preserved successful output during ancillary signals, explicit-report interruption, and stdout delivery failure. |
| Ownership and upgrades | Managed digest verification, invalid/missing receipt, npm/Cargo hints, exact release guidance, unchanged bytes/receipt, ownership-gated check shape, checksum/identity/replacement/rollback, and existing Windows helper tests remain covered. |
| Consumer boundaries | The full conformance gate covers Rust and Node SDKs; native feasibility includes successful fixture-backed JSON through a clean packed launcher, and the production packed consumer exercises explicit version reporting. |

The independent code review identified and resolved two bounded issues: valid
full terminal pages must be accepted, and lock initialization must publish a
complete header atomically. Regression tests cover both. Documentation was
harmonized around the CLI contract, with a successor pointer on the historical
upgrade plan.

## Validation and limits

On macOS ARM64 with Node v24.15.0:

- `bun run verify` passed, including deterministic installer, Rust/Node,
  release-pipeline, conformance, formatting, lint, license, and contract gates.
- `bun run native:feasibility` passed with the fixture-backed packaged advisory
  check.
- Focused Rust and CLI process tests were rerun for the review fixes.
- A release-profile macOS ARM64 build, standalone archive, and clean packed
  consumer passed, including the production explicit report through the npm
  launcher. Packaged ancillary SIGINT/SIGTERM preservation also passed.
- `cargo +1.88.0 check --locked -p kasb-cli` passed at the declared Rust minimum.
- Final formatting, clippy, local-link, and whitespace checks passed.

No live KASB/GitHub lookup was used for deterministic validation. Windows and
Linux runtime results for this change were not obtained on this host; existing
native CI/release gates remain responsible for those platforms. Forced process
termination cannot preserve undelivered output. Pathological filesystem stalls
are kept off the async executor; cooperative worker cancellation is tested,
but real stalled remote filesystems were not induced.

No version bump, tag, publication, installation into the user's CLI location,
commit, push, or PR is part of this work.

## Next action

None. Subsequent Windows/Linux runtime validation and publication are recorded
in the [completed release task](../tasks/release-cli-version-checking.md).
