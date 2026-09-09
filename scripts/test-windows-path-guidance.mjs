import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Execute the documented setup, replacing only registry access with an in-memory
// user PATH. Never mutate the developer/runner's persistent environment in tests.
export function testWindowsPathGuidance(powerShell) {
  const guide = readFileSync(new URL('../docs/windows-installation.md', import.meta.url), 'utf8');
  const blocks = [...guide.matchAll(/```powershell\n([\s\S]*?)```/g)].map((match) => match[1]);
  const persistent = blocks.find((block) => block.includes('$UserPath ='))
    .replace("[Environment]::GetEnvironmentVariable('Path', 'User')", '$script:StoredPath')
    .replace('[Environment]::SetEnvironmentVariable(\'Path\', "$UserPath$Separator$InstallDir", \'User\')', '$script:StoredPath = "$UserPath$Separator$InstallDir"');
  const session = blocks.find((block) => block.startsWith('if (-not (Test-KasbPathEntry $env:Path'));
  assert(persistent && session);
  assert(!persistent.includes('SetEnvironmentVariable') && !persistent.includes('GetEnvironmentVariable'),
    'documented registry access must be replaced before executing the test');
  const script = `
$ErrorActionPreference = 'Stop'
$env:KASB_INSTALL_DIR = Join-Path ([IO.Path]::GetTempPath()) ('kasb custom path ' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $env:KASB_INSTALL_DIR | Out-Null
try {
  $env:Path = 'C:\\Session;D:\\Keep'
  foreach ($Original in @('', 'C:\\Existing One;D:\\Existing Two', 'C:\\Existing;')) {
    $script:StoredPath = $Original
    $BeforeSession = $env:Path
    ${persistent}
    $Once = $script:StoredPath
    $ExpectedSeparator = if ($Original -eq '' -or $Original.EndsWith(';')) { '' } else { ';' }
    if ($Once -cne ($Original + $ExpectedSeparator + $InstallDir)) { throw 'selected directory was not registered while preserving existing entries' }
    if ($env:Path -cne $BeforeSession) { throw 'persistent setup changed current PATH' }
    ${persistent}
    if ($script:StoredPath -cne $Once) { throw 'repeated setup added a duplicate' }
    ${session}
    if (-not (Test-KasbPathEntry $env:Path $InstallDir)) { throw 'selected directory was not added to current PATH' }
    $ExpectedSession = if (Test-KasbPathEntry $BeforeSession $InstallDir) { $BeforeSession } else { $InstallDir + ';' + $BeforeSession }
    if ($env:Path -cne $ExpectedSession) { throw 'session PATH did not preserve existing entries' }
    $OnceSession = $env:Path
    ${session}
    if ($env:Path -cne $OnceSession) { throw 'session setup added a duplicate' }
  }
  foreach ($Equivalent in @(($InstallDir.ToUpperInvariant() + '\\'), ('"' + $InstallDir + '"'), '%KASB_INSTALL_DIR%')) {
    $script:StoredPath = 'C:\\Keep;' + $Equivalent + ';D:\\Keep'
    $Before = $script:StoredPath
    ${persistent}
    if ($script:StoredPath -cne $Before) { throw 'equivalent entry was duplicated or rewritten' }
  }
} finally { Remove-Item -LiteralPath $env:KASB_INSTALL_DIR -Force }
`;
  const result = spawnSync(powerShell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, `documented Windows PATH setup: ${result.stdout}\n${result.stderr}`);
}

export function testVisibilityReporting(powerShell) {
  const installer = readFileSync(new URL('../installers/install.ps1', import.meta.url), 'utf8');
  const helper = installer.slice(installer.indexOf('function Write-InstallationVisibility'), installer.indexOf('function Save-BoundedReleaseFile'));
  if (process.platform !== 'win32') {
    const compile = spawnSync(powerShell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `${helper}
$Path = [IO.Path]::GetTempFileName()
try {
  Write-InstallationVisibility $Path
  if (-not ('KasbInstaller.FinalPath' -as [type])) { throw 'native diagnostic did not compile' }
} finally { Remove-Item -LiteralPath $Path -Force }
`], { encoding: 'utf8', timeout: 30_000 });
    assert.equal(compile.status, 0, compile.stderr);
    assert.match(compile.stderr, /physical-path diagnostic unavailable/);
  }
  // Model the handle result, not OS virtualization. Native Windows resolution is
  // separately exercised by the real installer in test-installers.mjs.
  const probe = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
namespace KasbInstaller {
  public static class FinalPath {
    public static string Result;
    public static string Read(Microsoft.Win32.SafeHandles.SafeFileHandle handle) {
      if (string.IsNullOrEmpty(Result)) throw new System.InvalidOperationException("probe failure");
      return Result;
    }
  }
}
'@
${helper}
$Path = [IO.Path]::GetTempFileName()
try {
  [KasbInstaller.FinalPath]::Result = $Path.ToUpperInvariant()
  Write-InstallationVisibility $Path
  [KasbInstaller.FinalPath]::Result = 'C:\\Users\\sample\\Packages\\private\\kasb.exe'
  Write-InstallationVisibility $Path
  [KasbInstaller.FinalPath]::Result = $null
  Write-InstallationVisibility $Path
} finally { Remove-Item -LiteralPath $Path -Force }
`;
  const result = spawnSync(powerShell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', probe], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal((result.stderr.match(/Redirection or a filesystem alias/g) ?? []).length, 1, result.stderr);
  assert.match(result.stderr, /physical-path diagnostic unavailable/);
  assert.match(result.stdout, /Packages\\private\\kasb.exe/);
}
