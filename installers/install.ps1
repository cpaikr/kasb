#requires -Version 5.1
# Generated from Cargo.toml and native-targets.json. Do not edit.
$ErrorActionPreference = "Stop"
$Version = "0.1.0"
$Tag = "v0.1.0"
$Repository = "cpaikr/kasb"
$ChecksumAsset = "SHA256SUMS"
$ReceiptName = ".kasb-receipt.json"
$ApiBase = "https://api.github.com"
$DownloadBase = "https://github.com"
if ($env:KASB_INSTALLER_API_BASE -or $env:KASB_INSTALLER_DOWNLOAD_BASE) {
  if ($env:KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS -ne '1') { throw "kasb: release URL overrides are test-only" }
  if ($env:KASB_INSTALLER_API_BASE) { $ApiBase = $env:KASB_INSTALLER_API_BASE }
  if ($env:KASB_INSTALLER_DOWNLOAD_BASE) { $DownloadBase = $env:KASB_INSTALLER_DOWNLOAD_BASE }
}
$RunningWindows = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)
$RunningMacOS = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::OSX)
if (($env:KASB_INSTALLER_TEST_PLATFORM -or $env:KASB_INSTALLER_TEST_ARCH) -and $env:KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS -ne '1') { throw "kasb: platform overrides are test-only" }
$Platform = if ($env:KASB_INSTALLER_TEST_PLATFORM) { $env:KASB_INSTALLER_TEST_PLATFORM } elseif ($RunningWindows) { "Win32NT" } elseif ($RunningMacOS) { "Unix:OSX" } else { "Unix:Linux" }
$Architecture = if ($env:KASB_INSTALLER_TEST_ARCH) { $env:KASB_INSTALLER_TEST_ARCH } else { [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString() }
if ($Platform -eq "Unix:Linux" -and -not $env:KASB_INSTALLER_TEST_PLATFORM -and -not $env:KASB_INSTALLER_TEST_ARCH) {
  $GlibcIdentity = (& getconf GNU_LIBC_VERSION 2>$null | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $GlibcIdentity -notmatch '^glibc ([0-9]+.[0-9]+)') { throw "kasb: standalone Linux requires glibc" }
  if ([version]$Matches[1] -lt [version]'2.28') { throw "kasb: standalone Linux glibc is below 2.28" }
}
switch ("$Platform`:$Architecture") {
  "Unix:Linux:X64" { $Target = "linux-x64-gnu"; $Archive = "kasb-0.1.0-linux-x64-gnu.tar.gz"; $Executable = "kasb"; $ArchiveEntries = @('kasb', 'LICENSE.md', 'README.md', 'THIRD_PARTY_LICENSES.html') }
  "Unix:Linux:Arm64" { $Target = "linux-arm64-gnu"; $Archive = "kasb-0.1.0-linux-arm64-gnu.tar.gz"; $Executable = "kasb"; $ArchiveEntries = @('kasb', 'LICENSE.md', 'README.md', 'THIRD_PARTY_LICENSES.html') }
  "Unix:OSX:Arm64" { $Target = "darwin-arm64"; $Archive = "kasb-0.1.0-darwin-arm64.tar.gz"; $Executable = "kasb"; $ArchiveEntries = @('kasb', 'LICENSE.md', 'README.md', 'THIRD_PARTY_LICENSES.html') }
  "Win32NT:X64" { $Target = "win32-x64-msvc"; $Archive = "kasb-0.1.0-win32-x64-msvc.tar.gz"; $Executable = "kasb.exe"; $ArchiveEntries = @('kasb.exe', 'LICENSE.md', 'README.md', 'THIRD_PARTY_LICENSES.html') }
  default { throw "kasb: unsupported standalone target $Platform/$Architecture" }
}
$InstallDir = if ($env:KASB_INSTALL_DIR) { $env:KASB_INSTALL_DIR } elseif ($RunningWindows) { Join-Path $env:LOCALAPPDATA "kasb\bin" } else { Join-Path $HOME ".local/bin" }
$Destination = Join-Path $InstallDir $Executable
$Receipt = Join-Path $InstallDir $ReceiptName
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$Work = Join-Path $InstallDir (".kasb-install." + [guid]::NewGuid())
New-Item -ItemType Directory -Force -Path $Work | Out-Null
$Backup = Join-Path $Work "previous-kasb"
$ReceiptBackup = Join-Path $Work "previous-receipt"
$Committed = $false
$PublishStarted = $false
$HadDestination = $false
$HadReceipt = $false

Add-Type -AssemblyName System.Net.Http
function Save-BoundedReleaseFile([string]$Uri, [string]$Path, [long]$Limit, [int]$TimeoutSeconds) {
  $Parsed = [uri]$Uri
  $AllowInsecureTestUrl = $env:KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS -eq '1' -and $Parsed.Scheme -eq 'http'
  if ($Parsed.Scheme -ne 'https' -and -not $AllowInsecureTestUrl) { throw "kasb: refused an insecure release URL" }
  $Handler = New-Object System.Net.Http.HttpClientHandler
  $Handler.AllowAutoRedirect = $true
  $Handler.MaxAutomaticRedirections = 5
  $Client = New-Object System.Net.Http.HttpClient($Handler)
  $Client.Timeout = [TimeSpan]::FromSeconds($TimeoutSeconds)
  $Client.DefaultRequestHeaders.UserAgent.ParseAdd("kasb-installer/$Version")
  $Response = $null
  $ResponseStream = $null
  $Output = $null
  $Cancellation = New-Object System.Threading.CancellationTokenSource
  $Cancellation.CancelAfter([TimeSpan]::FromSeconds($TimeoutSeconds))
  try {
    $Response = $Client.GetAsync($Parsed, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead, $Cancellation.Token).GetAwaiter().GetResult()
    if (-not $Response.IsSuccessStatusCode) { throw "kasb: release request failed with HTTP $([int]$Response.StatusCode)" }
    $FinalUri = $Response.RequestMessage.RequestUri
    $FinalInsecureTestUrl = $env:KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS -eq '1' -and $FinalUri.Scheme -eq 'http'
    if ($FinalUri.Scheme -ne 'https' -and -not $FinalInsecureTestUrl) { throw "kasb: refused an insecure release redirect" }
    if ($Response.Content.Headers.ContentLength -ne $null -and $Response.Content.Headers.ContentLength -gt $Limit) { throw "kasb: release response exceeds size limit" }
    $ResponseStream = $Response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
    $Output = [System.IO.File]::Open($Path, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    $Buffer = New-Object byte[] 65536
    [long]$Total = 0
    while ($true) {
      $ReadCancellation = [System.Threading.CancellationTokenSource]::CreateLinkedTokenSource($Cancellation.Token)
      $ReadCancellation.CancelAfter([TimeSpan]::FromSeconds(15))
      try {
        $Count = $ResponseStream.ReadAsync($Buffer, 0, $Buffer.Length, $ReadCancellation.Token).GetAwaiter().GetResult()
      } finally {
        $ReadCancellation.Dispose()
      }
      if ($Count -eq 0) { break }
      $Total += $Count
      if ($Total -gt $Limit) { throw "kasb: release response exceeds size limit" }
      $Output.Write($Buffer, 0, $Count)
    }
    $Output.Flush($true)
  } finally {
    if ($Output) { $Output.Dispose() }
    if ($ResponseStream) { $ResponseStream.Dispose() }
    if ($Response) { $Response.Dispose() }
    $Cancellation.Dispose()
    $Client.Dispose()
    $Handler.Dispose()
  }
}
function Read-Exactly([System.IO.Stream]$Stream, [byte[]]$Buffer, [int]$Count) {
  [int]$Offset = 0
  while ($Offset -lt $Count) {
    $Read = $Stream.Read($Buffer, $Offset, $Count - $Offset)
    if ($Read -eq 0) { throw "kasb: truncated release archive" }
    $Offset += $Read
  }
}
function Flush-DurableFile([string]$Path) {
  $Stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::Read)
  try { $Stream.Flush($true) } finally { $Stream.Dispose() }
}
function Get-Sha256Hex([string]$Path) {
  $Stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
  try {
    $Algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
      $Digest = $Algorithm.ComputeHash($Stream)
      return ([System.BitConverter]::ToString($Digest)).Replace('-', '').ToLowerInvariant()
    } finally {
      $Algorithm.Dispose()
    }
  } finally {
    $Stream.Dispose()
  }
}
function Test-JsonInteger([object]$Value) {
  return $Value -is [byte] -or $Value -is [sbyte] -or $Value -is [int16] -or $Value -is [uint16] -or $Value -is [int32] -or $Value -is [uint32] -or $Value -is [int64] -or $Value -is [uint64]
}
function Test-AnyPath([string]$Path) {
  return [System.IO.File]::Exists($Path) -or [System.IO.Directory]::Exists($Path)
}
function Remove-ExactFile([string]$Path) {
  if ([System.IO.Directory]::Exists($Path)) { throw "kasb: replacement destination is not a regular file" }
  if ([System.IO.File]::Exists($Path)) { [System.IO.File]::Delete($Path) }
  if (Test-AnyPath $Path) { throw "kasb: replacement destination could not be removed" }
}
function Move-ExactFile([string]$Source, [string]$Destination) {
  if (-not [System.IO.File]::Exists($Source)) { throw "kasb: replacement source is missing" }
  if (Test-AnyPath $Destination) { throw "kasb: replacement destination still exists" }
  [System.IO.File]::Move($Source, $Destination)
}
function Test-BoundedExecutableIdentity([string]$Path, [string]$Expected) {
  $Info = New-Object System.Diagnostics.ProcessStartInfo
  $Info.FileName = $Path
  $Info.Arguments = "--version"
  $Info.UseShellExecute = $false
  $Info.CreateNoWindow = $true
  $Info.RedirectStandardInput = $true
  $Info.RedirectStandardOutput = $true
  $Info.RedirectStandardError = $true
  $Process = New-Object System.Diagnostics.Process
  $Process.StartInfo = $Info
  $Started = $false
  [byte[]]$Stdout = New-Object byte[] 129
  [byte[]]$Stderr = New-Object byte[] 129
  [int]$StdoutCount = 0
  [int]$StderrCount = 0
  $StdoutDone = $false
  $StderrDone = $false
  try {
    if (-not $Process.Start()) { throw "kasb: archive executable identity check failed" }
    $Started = $true
    $Process.StandardInput.Close()
    $StdoutTask = $Process.StandardOutput.BaseStream.ReadAsync($Stdout, 0, $Stdout.Length)
    $StderrTask = $Process.StandardError.BaseStream.ReadAsync($Stderr, 0, $Stderr.Length)
    $Deadline = [DateTime]::UtcNow.AddSeconds(5)
    while (-not ($Process.HasExited -and $StdoutDone -and $StderrDone)) {
      if (-not $StdoutDone -and $StdoutTask.IsCompleted) {
        $Count = $StdoutTask.GetAwaiter().GetResult()
        if ($Count -eq 0) { $StdoutDone = $true } else {
          $StdoutCount += $Count
          if ($StdoutCount -gt 128) { throw "kasb: archive executable identity output is too large" }
          $StdoutTask = $Process.StandardOutput.BaseStream.ReadAsync($Stdout, $StdoutCount, $Stdout.Length - $StdoutCount)
        }
      }
      if (-not $StderrDone -and $StderrTask.IsCompleted) {
        $Count = $StderrTask.GetAwaiter().GetResult()
        if ($Count -eq 0) { $StderrDone = $true } else {
          $StderrCount += $Count
          if ($StderrCount -gt 128) { throw "kasb: archive executable identity output is too large" }
          $StderrTask = $Process.StandardError.BaseStream.ReadAsync($Stderr, $StderrCount, $Stderr.Length - $StderrCount)
        }
      }
      if ([DateTime]::UtcNow -ge $Deadline) { throw "kasb: archive executable identity check timed out" }
      if (-not ($Process.HasExited -and $StdoutDone -and $StderrDone)) { Start-Sleep -Milliseconds 10 }
    }
    $Process.WaitForExit()
    if ($Process.ExitCode -ne 0) { throw "kasb: archive executable identity check failed" }
    $Reported = [System.Text.Encoding]::UTF8.GetString($Stdout, 0, $StdoutCount).Trim()
    if ($Reported -ne $Expected) { throw "kasb: archive executable version mismatch" }
  } finally {
    if ($Started -and -not $Process.HasExited) {
      try { $Process.Kill() } catch {}
      try { $Process.WaitForExit() } catch {}
    }
    $Process.Dispose()
  }
}
function Extract-TarExecutable([string]$ArchivePath, [string]$Name, [string[]]$ExpectedEntries, [string]$Destination, [long]$Limit) {
  $ArchiveInput = $null
  $Gzip = $null
  $Output = $null
  $Found = $false
  [int]$EntryCount = 0
  [long]$ExpandedBytes = 0
  $ObservedEntries = @()
  try {
    $ArchiveInput = [System.IO.File]::OpenRead($ArchivePath)
    $Gzip = New-Object System.IO.Compression.GzipStream($ArchiveInput, [System.IO.Compression.CompressionMode]::Decompress)
    $Header = New-Object byte[] 512
    $Discard = New-Object byte[] 65536
    while ($true) {
      Read-Exactly $Gzip $Header 512
      $AllZero = $true
      foreach ($Byte in $Header) { if ($Byte -ne 0) { $AllZero = $false; break } }
      if ($AllZero) { break }
      $EntryCount += 1
      if ($EntryCount -gt $ExpectedEntries.Count) { throw "kasb: release archive contains too many entries" }
      $EntryName = [System.Text.Encoding]::ASCII.GetString($Header, 0, 100).Trim([char]0)
      if ($ExpectedEntries -cnotcontains $EntryName -or $ObservedEntries -ccontains $EntryName) { throw "kasb: release archive contains an invalid entry set" }
      $ObservedEntries += $EntryName
      $SizeText = [System.Text.Encoding]::ASCII.GetString($Header, 124, 12).Trim([char]0, [char]32)
      if ($SizeText -notmatch '^[0-7]+$') { throw "kasb: invalid release archive entry size" }
      [long]$Size = [Convert]::ToInt64($SizeText, 8)
      $ExpandedBytes += $Size
      if ($Size -gt $Limit -or $ExpandedBytes -gt ($Limit * 2)) { throw "kasb: expanded release archive exceeds size limit" }
      $Type = [char]$Header[156]
      if ($EntryName -eq $Name) {
        if ($Found -or ($Type -ne [char]0 -and $Type -ne '0') -or $Size -le 0 -or $Size -gt $Limit) { throw "kasb: invalid release archive executable identity" }
        $Found = $true
        $Output = [System.IO.File]::Open($Destination, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
      }
      [long]$Remaining = $Size
      while ($Remaining -gt 0) {
        $Chunk = [Math]::Min([long]$Discard.Length, $Remaining)
        Read-Exactly $Gzip $Discard ([int]$Chunk)
        if ($Output) { $Output.Write($Discard, 0, [int]$Chunk) }
        $Remaining -= $Chunk
      }
      if ($Output) { $Output.Flush($true); $Output.Dispose(); $Output = $null }
      $Padding = (512 - ($Size % 512)) % 512
      if ($Padding -gt 0) { Read-Exactly $Gzip $Discard ([int]$Padding) }
    }
    if (-not $Found) { throw "kasb: release archive executable is missing" }
    if ($EntryCount -ne $ExpectedEntries.Count) { throw "kasb: release archive contains an invalid entry set" }
  } finally {
    if ($Output) { $Output.Dispose() }
    if ($Gzip) { $Gzip.Dispose() }
    if ($ArchiveInput) { $ArchiveInput.Dispose() }
  }
}
try {
  foreach ($ExistingPath in @($Destination, $Receipt)) {
    $ExistingItem = Get-Item -Force -LiteralPath $ExistingPath -ErrorAction SilentlyContinue
    if ($null -ne $ExistingItem -and ($ExistingItem.PSIsContainer -or (($ExistingItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0))) {
      throw "kasb: pre-existing installation paths must be regular files"
    }
  }
  foreach ($Base in @($ApiBase, $DownloadBase)) {
    if ($Base -notmatch '^https://') {
      if ($env:KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS -ne '1' -or $Base -notmatch '^http://') { throw "kasb: refused an insecure release URL" }
    }
  }
  $MetadataPath = Join-Path $Work "release.json"
  Save-BoundedReleaseFile "$ApiBase/repos/$Repository/releases/tags/$Tag" $MetadataPath 1048576 15
  $Metadata = Get-Content -Raw -LiteralPath $MetadataPath | ConvertFrom-Json
  if ($Metadata.immutable -isnot [bool] -or $Metadata.immutable -ne $true) { throw "kasb: release is not immutable" }
  if ($Metadata.draft -isnot [bool] -or $Metadata.prerelease -isnot [bool]) { throw "kasb: release production flags are invalid" }
  if ($Metadata.draft -ne $false -or $Metadata.prerelease -ne $false) { throw "kasb: release is not a production release" }
  if ($Metadata.tag_name -isnot [string] -or $Metadata.tag_name -cne $Tag) { throw "kasb: release tag identity mismatch" }
  $ReleaseAssets = @($Metadata.assets)
  foreach ($Asset in $ReleaseAssets) {
    if ($null -eq $Asset -or $Asset.name -isnot [string]) { throw "kasb: release asset name identity is invalid" }
  }
  $CaseVariantAssets = @($ReleaseAssets | Where-Object {
    ($_.name -ieq $Archive -and $_.name -cne $Archive) -or
    ($_.name -ieq $ChecksumAsset -and $_.name -cne $ChecksumAsset)
  })
  if ($CaseVariantAssets.Count -ne 0) { throw "kasb: release asset name identity is invalid" }
  $ArchiveAssets = @($ReleaseAssets | Where-Object { $_.name -ceq $Archive })
  $ChecksumAssets = @($ReleaseAssets | Where-Object { $_.name -ceq $ChecksumAsset })
  if ($ArchiveAssets.Count -ne 1) { throw "kasb: release archive is missing or duplicated" }
  if ($ChecksumAssets.Count -ne 1) { throw "kasb: release checksum manifest is missing or duplicated" }
  $ArchiveAsset = $ArchiveAssets[0]
  $ChecksumAssetMetadata = $ChecksumAssets[0]
  $ExpectedArchiveUrl = "https://github.com/$Repository/releases/download/$Tag/$Archive"
  $ExpectedChecksumUrl = "https://github.com/$Repository/releases/download/$Tag/$ChecksumAsset"
  if ($ArchiveAsset.browser_download_url -isnot [string] -or $ArchiveAsset.browser_download_url -cne $ExpectedArchiveUrl) { throw "kasb: release archive URL identity mismatch" }
  if ($ChecksumAssetMetadata.browser_download_url -isnot [string] -or $ChecksumAssetMetadata.browser_download_url -cne $ExpectedChecksumUrl) { throw "kasb: release checksum URL identity mismatch" }
  if (-not (Test-JsonInteger $ArchiveAsset.size)) { throw "kasb: release archive metadata has an invalid size" }
  if (-not (Test-JsonInteger $ChecksumAssetMetadata.size)) { throw "kasb: release checksum metadata has an invalid size" }
  if ($ArchiveAsset.size -le 0 -or $ArchiveAsset.size -gt 134217728) { throw "kasb: release archive metadata exceeds size limit" }
  if ($ChecksumAssetMetadata.size -le 0 -or $ChecksumAssetMetadata.size -gt 1048576) { throw "kasb: release checksum metadata exceeds size limit" }
  $ArchivePath = Join-Path $Work $Archive
  $Checksums = Join-Path $Work $ChecksumAsset
  Save-BoundedReleaseFile "$DownloadBase/$Repository/releases/download/$Tag/$Archive" $ArchivePath 134217728 300
  Save-BoundedReleaseFile "$DownloadBase/$Repository/releases/download/$Tag/$ChecksumAsset" $Checksums 1048576 15
  if ((Get-Item -LiteralPath $ArchivePath).Length -ne $ArchiveAsset.size) { throw "kasb: release archive size identity mismatch" }
  if ((Get-Item -LiteralPath $Checksums).Length -ne $ChecksumAssetMetadata.size) { throw "kasb: release checksum size identity mismatch" }
  $Line = @(Get-Content $Checksums | Where-Object { $_ -cmatch "^[0-9a-fA-F]{64}  $([regex]::Escape($Archive))$" })
  if ($Line.Count -ne 1) { throw "kasb: invalid or missing archive checksum" }
  $Expected = $Line[0].Substring(0, 64).ToLowerInvariant()
  $Actual = Get-Sha256Hex $ArchivePath
  if ($Actual -ne $Expected) { throw "kasb: archive checksum mismatch" }
  $Staged = Join-Path $Work $Executable
  Extract-TarExecutable $ArchivePath $Executable $ArchiveEntries $Staged 134217728
  if (-not $RunningWindows) {
    $UnixFileModeType = [System.IO.File].Assembly.GetType('System.IO.UnixFileMode')
    $SetUnixFileMode = @([System.IO.File].GetMethods() | Where-Object {
      $_.Name -eq 'SetUnixFileMode' -and $_.GetParameters().Count -eq 2 -and $_.GetParameters()[1].ParameterType.FullName -eq 'System.IO.UnixFileMode'
    })[0]
    if ($null -ne $UnixFileModeType -and $null -ne $SetUnixFileMode) {
      [void]$SetUnixFileMode.Invoke($null, @($Staged, [System.Enum]::ToObject($UnixFileModeType, 493)))
    } else {
      & chmod 755 $Staged
      if ($LASTEXITCODE -ne 0) { throw "kasb: could not mark the archive executable as executable" }
    }
  }
  Flush-DurableFile $Staged
  Test-BoundedExecutableIdentity $Staged "kasb $Version"
  $Digest = Get-Sha256Hex $Staged
  $ReceiptStaged = Join-Path $Work "receipt.new"
  $CanonicalInstallDir = (Resolve-Path -LiteralPath $InstallDir).ProviderPath
  $CanonicalDestination = [System.IO.Path]::GetFullPath((Join-Path $CanonicalInstallDir $Executable))
  $ReceiptJson = [ordered]@{ schemaVersion = 1; manager = 'standalone'; version = $Version; target = $Target; executable = $CanonicalDestination; releaseRepository = $Repository; releaseTag = $Tag; assetName = $Archive; sha256 = $Digest } | ConvertTo-Json -Compress
  [System.IO.File]::WriteAllText($ReceiptStaged, $ReceiptJson + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
  Flush-DurableFile $ReceiptStaged
  $HadDestination = Test-Path -LiteralPath $Destination
  $HadReceipt = Test-Path -LiteralPath $Receipt
  $PublishStarted = $true
  if ($HadDestination) { Move-ExactFile $Destination $Backup }
  if ($HadReceipt) { Move-ExactFile $Receipt $ReceiptBackup }
  if ($env:KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS -eq '1' -and $env:KASB_INSTALLER_TEST_INTERRUPT_AFTER_BACKUP -eq "1") { throw "kasb: simulated interrupted installation" }
  Move-ExactFile $Staged $Destination
  if ($env:KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS -eq '1' -and $env:KASB_INSTALLER_TEST_FAIL_RECEIPT_PUBLISH -eq "1") { throw "kasb: simulated receipt publication failure" }
  Move-ExactFile $ReceiptStaged $Receipt
  Flush-DurableFile $Destination
  Flush-DurableFile $Receipt
  $Committed = $true
  Write-Output "Installed kasb $Version at $Destination"
} finally {
  $PreserveWork = $false
  if (-not $Committed -and $PublishStarted) {
    $RollbackOk = $true
    if ($env:KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS -eq '1' -and $env:KASB_INSTALLER_TEST_FAIL_ROLLBACK -eq '1') {
      $RollbackOk = $false
    } else {
      try {
        if ($HadDestination) {
          if ([System.IO.File]::Exists($Backup)) {
            Remove-ExactFile $Destination
            Move-ExactFile $Backup $Destination
          } elseif (-not [System.IO.File]::Exists($Destination)) { $RollbackOk = $false }
        } else {
          Remove-ExactFile $Destination
        }
      } catch {
        if ($HadDestination -or (Test-Path -LiteralPath $Destination)) { $RollbackOk = $false }
      }
      try {
        if ($HadReceipt) {
          if ([System.IO.File]::Exists($ReceiptBackup)) {
            Remove-ExactFile $Receipt
            Move-ExactFile $ReceiptBackup $Receipt
          } elseif (-not [System.IO.File]::Exists($Receipt)) { $RollbackOk = $false }
        } else {
          Remove-ExactFile $Receipt
        }
      } catch {
        if ($HadReceipt -or (Test-Path -LiteralPath $Receipt)) { $RollbackOk = $false }
      }
    }
    if (-not $RollbackOk) {
      $PreserveWork = $true
      [Console]::Error.WriteLine("kasb: installation rollback was incomplete; recovery files remain in $Work")
    }
  }
  if (-not $PreserveWork) { Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $Work }
}
