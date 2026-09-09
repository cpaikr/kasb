# Windows installation visibility and PATH setup

Status: released in v0.4.3; native Windows CI passed; independent ordinary-terminal validation pending (2026-09-09).

[Issue #30](https://github.com/cpaikr/kasb/issues/30) owns the request.
[Windows installation and recovery](../docs/windows-installation.md) owns the
consumer procedure; [release posture](../docs/release.md) owns publication.

## Implementation

The generated PowerShell installer reports handle-resolved executable and
receipt paths, warns on a mismatch or unavailable diagnostic, and leaves
external terminal visibility explicitly unverified. A path mismatch can also
reflect a junction or other alias; the diagnostic does not classify its cause.
The default directory remains unchanged. Recovery uses the official installer
from an independent ordinary terminal or a visible `KASB_INSTALL_DIR`, keeping
the executable and ownership receipt together.

The guide separates physical visibility and invocation, persistent user PATH,
and inherited session PATH. Copyable registration preserves existing entries
and avoids equivalent duplicates. Candidate consumer checks cover full-path
and command-name invocation in current and child Windows shells, explicitly
within the runner's shared filesystem context.

## Evidence and validation

The issue records Windows x64, packaged Codex 26.901.6511.0, and PowerShell
7.6.5/Windows PowerShell on 2026-09-09. An open executable handle resolved the
advertised AppData path into
`Packages\OpenAI.Codex_<family>\LocalCache\Local`. An independent ordinary
terminal could not see the advertised KASB path despite correct PATH and
PATHEXT. This is incident evidence of AppData redirection, consistent with the
[Microsoft explanation](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-behind-the-scenes#appdata-operations-on-windows-10-version-1903-and-later),
not a reproduction of the changed installer.

Reinstallation into `%USERPROFILE%\.local\bin` produced matching physical
paths for KASB, Darty, and YTM in the installing context. Independent user
confirmation covered **Darty's `--help` only**; it does not establish independent
KASB invocation or verification in every tab.

During this implementation, connection to the available Windows host over SSH
timed out. Portable helper tests ran with PowerShell 7.6.6 on macOS: they
exercise the documented PATH logic with simulated user-PATH storage and model
handle results for diagnostic reporting. Compilation of the actual embedded C#
also passed, with the native API correctly reported unavailable on macOS.
`KASB_REQUIRE_POWERSHELL_TESTS=1 node scripts/test-installers.mjs --powershell-only`
passed with PowerShell available on PATH and `TMPDIR=/private/tmp`. Generation
freshness, Node syntax, scoped documentation links, and diff checks passed.
These local checks do not exercise Windows registry persistence, native handle
resolution, or escape from a packaged filesystem view. Native Windows release
validation is recorded below. Full
`bun run verify` passed, including contracts, metadata, licenses, typechecks,
Rust/Node tests, release-pipeline checks, conformance, builds, formatting, and
Clippy. Bounded code review and scoped documentation harmonization completed.

## Release

[v0.4.3](https://github.com/cpaikr/kasb/releases/tag/v0.4.3) published from
`8164de575c1fd151b64e6fed56d5852dd2d0fe8f` following the authorized patch release.
Local release preparation passed `bun run verify`. The
[strict publication run](https://github.com/cpaikr/kasb/actions/runs/34318630791)
passed all native target jobs, including the actual Windows installer and
upgrade tests, and all sealed candidate consumers, including Windows full-path
and command discovery in current and child shells. The GitHub API confirms a
stable, published, immutable release with the complete expected asset set.

Downloaded published installers matched both `SHA256SUMS` and tagged source.
The publication receipt confirmed success, immutability, the source commit, and
all asset digests. On macOS, the downloaded official installer installed into a
custom directory; full-path `--version` and `--help` passed, and the adjacent
receipt matched the selected absolute executable path and digest.
`upgrade --check` reported managed ownership with current/latest v0.4.3 and no
update. New `/bin/sh` and `/bin/zsh` consumers passed command discovery,
`--version`, and `--help` with scoped PATH. These macOS checks do not establish
Windows MSIX visibility.

Windows runner tests validate native behavior within the runner context. They
do not cross the packaged installer's filesystem boundary or verify persistent
user PATH from an independently launched ordinary terminal.

## Remaining evidence

Install the published Windows release and verify the selected full path,
receipt ownership, `--version`, `--help`, and command discovery from an ordinary
terminal opened independently of the packaged installer. Repeat in a
newly opened ordinary terminal without the session PATH update to verify
persistent registration. Automation is acceptable only if it crosses that
launch/filesystem boundary. Runner child-shell success alone does not close
this gap.
