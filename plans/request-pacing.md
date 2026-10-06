# Pace KASB requests across local processes

Status: complete. Released in
[v0.5.0](https://github.com/cpaikr/kasb/releases/tag/v0.5.0) on 2026-10-06
through PRs #31 and #32, prepared in #34 and tagged at `ca9343d`. The tag
workflow verified all four targets and clean consumers on Node 20.18.1-26 and
published an immutable release.

## Outcome and decision

Adopted the accepted [mytech pacing practice](../../mytech/practices/external-request-pacing.md):
every KASB request from the Rust SDK, Node SDK, and CLI waits a shared minimum
interval, coordinated across local processes. The default is **500 ms**, a
project decision matching darty; KASB publishes no limit. The risk being
managed is address blocking of an unauthenticated API reached with a browser
persona, not a documented quota.

This resolves the rate-limiting half of
[auth and rate limiting](../tasks/auth-and-rate-limiting.md). Current
semantics, configuration, and evidence are owned by the
[v1 spec](../docs/specs/kasb-standards-v1.md#request-pacing), the
[CLI contract](../crates/kasb-cli/README.md#request-pacing), and the
[source map](../docs/research/kasb-standard-source-map.md#request-pacing); this
record keeps only decisions and validation.

## Decisions

- **Fan-out first.** `search-standards` ranked by fetching one structure index
  per result row (67–154 rows for common keywords), which paced serially would
  take 34–77 s. KASB has no title-list endpoint; its site bundles titles as
  static client data. The SDK now bundles structure-derived titles
  (`crates/kasb/data/standard-titles.json`) and fetches structure only for
  standards the table does not know. A match-count window was rejected because
  relevance ranks title matches first, and a runtime cache was rejected for its
  state and staleness semantics.
- **Gate design.** darty's design, ported to `crates/kasb/src/http/pacing.rs`:
  an OS file lock held from the cooldown through the response body. The wait
  precedes the HTTP deadline and is cancellable. Environment settings are
  resolved per request, so client construction never fails on them.
- **Departures from darty, from review.** Each caller still waits its own
  interval regardless of the clock, but the record also stores when it was
  written so the excess above that interval (a stricter process or a
  rate-limit back-off) ages out instead of delaying a request hours later.
  Waiting on a lock another process holds is bounded at five minutes and then
  fails as retryable `internal_failure`. A failure to record a 429 cooldown no
  longer hides `rate_limited`. The title generator refuses to replace a
  recorded title with "untitled" on a source-shape failure.
- **One enrichment path.** Fixture clients use the bundled table too, so the
  judge exercises shipped behavior. Tests of the live fallback use standard
  numbers from 900000, a range the table is asserted never to contain.
- **Rate limits.** HTTP 429 became the public `rate_limited` code and extends
  the shared cooldown (`Retry-After` seconds, else 10 s, capped at 60 s). No
  automatic retry was added. HTTP-date `Retry-After` uses the fallback to avoid
  depending on the local clock.
- **No public off switch, from PR review.** The practice allows `0` for
  controlled tests and fixture origins, but the CLI flag, Node option, and
  environment variable always reach KASB, so they accept 1-60000. Only the
  Rust SDK's explicit option accepts zero. Pacing-state failures surface with
  a fixed message and no operating-system detail, and the title generator pins
  the default interval instead of reading the environment.
- **Diagnostics.** `kasb request-pacing` reports the effective interval, its
  source (`flag`, `environment`, or `default`), and the state file, resolved
  as the SDK resolves it per request and without contacting KASB.
- **Node option.** `requestIntervalMs` is per call and reuses the shared
  persona's pool, cookies, and gate instead of building a client per interval.
- **Kept.** `max_in_flight` and enrichment concurrency remain; they still bound
  unpaced runs and are inert while the gate serializes requests.

## Validation (Windows x64 host)

- Rust: 116 workspace tests pass in three consecutive runs, including cooldown survival after long-held
  and cancelled permits, larger-interval and `Retry-After` precedence, damaged
  state failing closed, a four-process test with a shared `KASB_STATE_DIR`
  asserting request gaps of at least the interval, rejection of invalid
  `KASB_REQUEST_INTERVAL_MS` values, back-off aging, and the lock-wait bound. `cargo fmt --check` and workspace clippy
  with `-D warnings` pass.
- Node: 69 package tests and typecheck pass; `bun run contracts:check` passes.
- Conformance: all 112 `bun run conformance:judge` tests pass after removing
  the structure route that `search-standards-success` no longer requests.
- Live: the 199-request title capture ran through the SDK at the default
  interval in 110 s (about 550 ms per request) with no 429. One live
  `search-standards --keyword 리스` returned 67 ranked standards from a single
  request.

Windows defects found and fixed along the way, none caused by pacing: usage
text printed `kasb.exe` (now a fixed `bin_name`); Cargo ownership detection
compared a verbatim canonical path with a raw one and ignored `USERPROFILE`;
the Node conformance runner imported an absolute path instead of a file URL;
and a process-wide test counter raced across parallel CLI tests (now
per-thread). Eighteen tracked files had stale CRLF working copies that broke
fixture checksums; they were re-checked out, with no repository change.
The combined `bun run verify` command was not run locally. Linux CI ran each
of its steps separately: Deterministic validation passed for #34 and on
`main` at the release merge (`032d388`), and the tag workflow then passed
all four targets.

## Remaining

- Discovery of new standard numbers is manual: pass them to
  `standard_titles --write`. Unknown standards still work through the live
  fallback.
