# Windows installation visibility and PATH setup

Status: implemented and locally verified; independent Windows validation pending; unreleased (2026-09-09).

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
These checks do not exercise Windows registry persistence, native handle
resolution, or escape from a packaged filesystem view. The native Windows
installer suite and candidate consumer branch remain unexecuted. Full
`bun run verify` passed, including contracts, metadata, licenses, typechecks,
Rust/Node tests, release-pipeline checks, conformance, builds, formatting, and
Clippy. Bounded code review and scoped documentation harmonization completed.

## Remaining evidence

Run the changed installer on native Windows, then verify the selected full
path, receipt ownership, `--version`, `--help`, and command discovery from an
ordinary terminal opened independently of the packaged installer. Repeat in a
newly opened ordinary terminal without the session PATH update to verify
persistent registration. Automation is acceptable only if it crosses that
launch/filesystem boundary. Runner child-shell success alone does not close
this gap. Publication of a patch release was authorized on 2026-09-09; native release
gates must pass before publication.
