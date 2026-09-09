# kasb-cli

First-class Rust `kasb` CLI over the public [`kasb`](../kasb/README.md) SDK.
The crate owns commands, presentation, stdout/stderr, cancellation, and exit
status. The SDK owns KASB transport, source decoding, and capability semantics.

```sh
kasb --help
kasb help get-section
kasb --version
kasb version-check --pretty
kasb version-check --refresh
kasb upgrade --check
kasb upgrade
```

From a checkout, prefix command arguments with
`cargo run --locked -p kasb-cli --bin kasb --`.

## Output and version advisories

Content commands emit one newline-terminated JSON document on stdout in every
output mode, including summary, raw, and pretty. Stderr stays empty. Primary
failures exit 1; help and successful results exit 0. Cancellation interrupts
primary operations; a failure to deliver stdout exits 1.

After successful content retrieval, the CLI checks cached release evidence and
refreshes it when due, including in CI, pipes, and agent use. An optional
`advisories.versionCheck` appears beside the unchanged `result`, `metadata`,
`references`, and `warnings`. It is a CLI extension, separate from provider
warnings and SDK envelopes. Fresh equal, ahead, and confirmed no-stable-release
observations are quiet unless distribution or inspection problems need reporting.
Help, exact `--version`, invalid input, initialization/render failures, provider
failures, and cancelled primary operations skip incidental work entirely.

Use global `--no-version-check` or `KASB_NO_VERSION_CHECK=1` to skip all incidental
inspection, cache reads/writes, locking, and release requests. Other environment
values do not opt out. These settings do not disable explicit `version-check`,
`upgrade --check`, or `upgrade` work.

`version-check [--refresh] [--pretty]` returns a report for any installation,
including equal/ahead, no stable release, and unavailable evidence. It constructs
no KASB client and returns the report at `result.versionCheck`, with CLI-local
metadata and no duplicate incidental advisory. A completed report exits 0 even
when evidence is unavailable. `--refresh` bypasses both TTL and failure cooldown,
while retaining the nonblocking lock and total budget.

Cancellation during an incidental check preserves the completed primary result
and exit 0; cancellation during explicit reporting exits 130 without JSON.
POSIX SIGINT/SIGTERM follow that phase distinction. Forceful process termination,
including Node's Windows termination mechanism, cannot preserve pending output.

## Report schema

The field-level contract is independently checked by
[`version-check.schema.json`](../../conformance/version-check.schema.json).
[Complete explicit-response examples](../../fixtures/version-check/reports.json)
cover newer, equal, ahead, absence, uncomparable identity, unavailable evidence,
stale evidence, and incomplete distribution.

| Field | Meaning |
| --- | --- |
| `currentVersion` | Running executable's embedded identity; never taken from cache or receipt |
| `comparison` | `newer`, `equal`, `ahead`, `noStableRelease`, `uncomparable`, or `unavailable` |
| `freshness` | `fresh`, `stale`, or `unavailable`, independent of comparison |
| `observedAt`, `ageSeconds` | Unix observation time in seconds and nonnegative age; both absent without evidence |
| `release` | Optional selected `version`, `tag`, exact canonical `url`, `repository`, and supported `target` |
| `distribution` | `status`: `ready`, `incomplete`, `unsupported`, or `unknown`; incomplete reports include bounded `problems` |
| `installation` | `owner`, `verified`, and project-owned `nextAction` |
| `problems` | Bounded refresh, cache, inspection, clock, and identity problem codes |

Distribution problems are `{ "code": "mutableRelease" }` or
`{ "code": "asset", "name": "SHA256SUMS", "reason": "missing" }`.
Asset reasons distinguish `missing`, `duplicate`, `invalidUrl`, and `invalidSize`.
Names come from the embedded manifest, never an arbitrary remote suggestion.
No raw HTTP body, credential, remote command, or untrusted URL is returned.

Top-level problem codes are `refreshFailed`, `refreshTimedOut`,
`refreshInProgress`, `cacheUnavailable`, `cacheInvalid`, `inspectionFailed`,
`inspectionTimedOut`, `clockInvalid`, and `uncomparableIdentity`.

Installation owners are `standalone`, `npm`, `cargo`, and `unknown`. Only a
standalone receipt verified against the running executable's identity and digest
sets `verified: true`. npm/Cargo path recognition is a qualified owner hint.
`nextAction` means:

| Action | Guidance |
| --- | --- |
| `upgradeWithKasb` | Run `kasb upgrade` explicitly; offered only for verified standalone ownership and a fresh, ready newer release |
| `consultNpmOwner` | Consult the npm installation owner; a GitHub release does not prove npm registry availability |
| `rebuildWithCargo` | Rebuild through the Cargo/source installation owner |
| `inspectInstallationOwner` | Identify the installation method before manually updating or rebuilding |
| `inspectRelease` | Inspect the exact release evidence; no replacement is authorized |

Version equality proves neither source-commit freshness nor executable integrity.
Prerelease/development identities are explicitly uncomparable. A report is
evidence, never permission to replace an installation.

## Discovery, cache, and bounds

The CLI enumerates canonical public releases and selects the highest stable
product version by semantic precedence, excluding drafts, prereleases,
unrelated tags, and the manifest's retired-version floor. Publication time and
GitHub's `/latest` selection do not determine the result. Ambiguous identities,
malformed or unfinished pagination, and noncanonical navigation fail closed.

Selection precedes distribution inspection: an incomplete newest release stays
selected. Readiness checks immutability plus unique canonical archive, checksum,
and platform installer metadata within manifest-derived size limits. It does
not download archives or verify their bytes or publisher integrity.

| Policy | Bound |
| --- | --- |
| Successful evidence TTL | 6 hours |
| Failed-refresh retry cooldown | 15 minutes |
| Entire incidental phase | 2 seconds of foreground latency |
| Explicit report phase | 5 seconds |
| Release enumeration | At most 5 pages of 100 releases and 1 MiB aggregate response bytes |
| Cache record / report | 64 KiB / 8 KiB |
| Lock acquisition | Nonblocking; a losing process reuses evidence or reports `refreshInProgress` |

Inspection, disk work, requests, and decoding share one cancellable deadline.
Local filesystem operations and incremental executable hashing run outside the
async executor and check cancellation/deadline between bounded operations.
No daemon or detached release refresh runs. The complete JSON response waits
for the foreground advisory phase. OS scheduling may add delivery overhead.

Cache locations:

- Linux: `$XDG_CACHE_HOME/kasb` for an absolute XDG path, otherwise `~/.cache/kasb`.
- macOS: `~/Library/Caches/kasb`.
- Windows: `%LOCALAPPDATA%\kasb\cache`.

The key includes tool, canonical repository, stable channel, and target, allowing
reuse across working directories and installation paths. The disposable cache
contains validated release observations and failed-attempt times, never current
version comparisons, ownership, credentials, or installation authorization.
Writes use atomic same-directory replacement and crash-released OS locks.

A failed refresh retains prior complete evidence with its original observation
time and a stale label, recording cooldown when possible. Future timestamps and
clock rollback cannot establish freshness or suppress retries. Corrupt, oversized,
foreign, symlink-unsafe, or unavailable cache state cannot fail the primary
operation or overwrite unrelated files. An unavailable cache permits a bounded
uncached lookup with a visible cache problem.

## Explicit managed upgrades

`upgrade --check` and `upgrade` require an adjacent `.kasb-receipt.json` that
agrees with the executable, target, version, canonical release, asset, and digest.
They retain their existing ownership errors and result fields. Both obtain fresh,
complete release discovery; cached evidence cannot authorize installation.
Actual upgrades revalidate the exact selected release before download and retain
archive/checksum, executable identity, staging, replacement, and rollback checks.
Windows replacement is scheduled after process exit and is not reported as
already applied. Reports never reconcile or clean up deferred-upgrade state.

See [release posture](../../docs/release.md) for distribution ownership and
publication status. The npm launcher only forwards the Rust process contract;
the SDK, toolset, and Node binding perform no release checks.
