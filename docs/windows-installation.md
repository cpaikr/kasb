# Windows installation and recovery

Use Windows x64 and PowerShell 5.1 or newer. The standalone installer needs
neither Node.js nor Rust. Start with the [README installation steps](../README.md#windows).
Run installation and PATH registration from an ordinary PowerShell terminal
opened independently of a packaged desktop agent.

## Choose a visible destination

The default is `%LOCALAPPDATA%\kasb\bin`; `KASB_INSTALL_DIR` selects a custom
directory. If the installer sees `kasb.exe` but your ordinary terminal reports
that the same full path does not exist, PATH changes cannot fix that visibility
failure. Reinstall from the ordinary terminal, or select a destination visible
to it. This was the recovery location in [issue #30](https://github.com/cpaikr/kasb/issues/30),
not a universal Windows directory requirement:

```powershell
$env:KASB_INSTALL_DIR = Join-Path $env:USERPROFILE '.local\bin'
Invoke-RestMethod https://github.com/cpaikr/kasb/releases/latest/download/install.ps1 | Invoke-Expression
```

Then use that selected directory in the PATH steps below. Reinstall the
executable and `.kasb-receipt.json` together through the official installer;
do not copy only the executable or hand-edit the receipt. The receipt must
name the selected executable and match its digest for
[managed upgrades](release.md#standalone-ownership-and-trust).

The checkout installer reports handle-resolved paths for the executable and
receipt, warns when they differ from the selected paths, and explicitly leaves
external visibility unverified. This diagnostic awaits a release; published
installers may only print the install location. A difference can also be a
junction or another filesystem alias; it does not alone identify virtualization.
A failed diagnostic is reported without undoing a completed installation.

## Register persistent user PATH

Run this in the ordinary PowerShell session used for installation. If you
selected a custom directory in another session, first set `KASB_INSTALL_DIR`
to that same directory here. The code preserves the existing user PATH text,
compares entries case-insensitively (including environment references and
trailing separators), and adds the selected directory only when absent.
It does not copy the process or machine PATH into user PATH or edit profiles.

```powershell
$InstallDir = if ($env:KASB_INSTALL_DIR) { $env:KASB_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'kasb\bin' }
$InstallDir = (Resolve-Path -LiteralPath $InstallDir -ErrorAction Stop).ProviderPath
function Test-KasbPathEntry([string]$PathValue, [string]$Directory) {
    $Expected = $Directory.TrimEnd('\', '/')
    foreach ($Entry in ($PathValue -split ';')) {
        $Expanded = [Environment]::ExpandEnvironmentVariables($Entry.Trim().Trim('"')).TrimEnd('\', '/')
        if ([string]::Equals($Expanded, $Expected, [StringComparison]::OrdinalIgnoreCase)) { return $true }
    }
    return $false
}
$UserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not (Test-KasbPathEntry $UserPath $InstallDir)) {
    $Separator = if ([string]::IsNullOrEmpty($UserPath) -or $UserPath.EndsWith(';')) { '' } else { ';' }
    [Environment]::SetEnvironmentVariable('Path', "$UserPath$Separator$InstallDir", 'User')
}
```

## Update the current session separately

Persistent registration does not rewrite an already-running shell's inherited
PATH. In the same session after the preceding block, run:

```powershell
if (-not (Test-KasbPathEntry $env:Path $InstallDir)) {
    $env:Path = "$InstallDir;$env:Path"
}
```

## Verify from the consumer terminal

In your independently opened ordinary PowerShell, set `$InstallDir` to the
actual selected directory, then run the following. `Test-Path` and full-path
execution check visibility and invocation; `Get-Command` and command-name
execution check discovery. Check that discovery selects this installation,
especially if another KASB installation exists earlier in PATH.

```powershell
$Executable = Join-Path $InstallDir 'kasb.exe'
Test-Path -LiteralPath $Executable -PathType Leaf
& $Executable --version
& $Executable --help
Get-Command kasb -CommandType Application -All | Select-Object Source
kasb --version
kasb --help
```

Repeat these checks in a newly opened ordinary terminal, setting `$InstallDir`
again but **without** the current-session PATH update. The version should match
the installer-selected release. If full-path execution works but discovery
fails, inspect persistent user PATH and the new terminal's `$env:Path`.
A new tab can inherit a stale environment from an existing terminal application;
fully close and reopen that application, or sign out and back in if needed.
If full-path visibility fails, return to destination recovery above.

An installer and shells it launches may share the same private filesystem
view. Even a new `powershell.exe` child of that installer does not prove
ordinary-user visibility. Automated verification must cross the relevant
launch/filesystem boundary; otherwise record its context and the remaining gap.

The [implementation and validation record](../tasks/windows-installation-visibility.md)
tracks the diagnostic's release status and independent Windows verification gap.
