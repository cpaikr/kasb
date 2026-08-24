import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { chmod, mkdir, mkdtemp, readdir, readFile, readlink, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { loadReleaseContract, releaseTag, repositoryRoot } from "./release-contract.mjs";

const contract = await loadReleaseContract();
const powerShellOnly = process.argv.includes("--powershell-only");
const root = await mkdtemp(join(tmpdir(), "kasb installer tests "));
const routes = new Map();
const requests = [];
const server = createServer((request, response) => {
  requests.push(request.url);
  const route = routes.get(request.url);
  if (!route) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(route.status ?? 200, { "content-type": route.type ?? "application/octet-stream" });
  response.end(route.body);
});
await new Promise((resolveReady) => server.listen(0, "127.0.0.1", resolveReady));
const base = `http://127.0.0.1:${server.address().port}`;

try {
  if (!powerShellOnly) {
  for (const target of contract.targets.filter(({ npmPlatform }) => npmPlatform !== "win32")) {
    const fixture = await fixtureFor(target);
    configureRelease(fixture);
    const installDir = join(root, `${target.releaseTarget} path with spaces`);
    const result = await run("sh", [resolve(repositoryRoot, "installers/install.sh")], {
      KASB_INSTALLER_API_BASE: base,
      KASB_INSTALLER_DOWNLOAD_BASE: base,
      KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS: "1",
      KASB_INSTALLER_TEST_OS: target.npmPlatform === "darwin" ? "Darwin" : "Linux",
      KASB_INSTALLER_TEST_ARCH: target.npmArch === "x64" ? "x86_64" : "aarch64",
      KASB_INSTALL_DIR: installDir,
    });
    assert(result.code === 0, `${target.releaseTarget} shell install failed: ${result.stderr}`);
    const receipt = JSON.parse(await readFile(join(installDir, contract.release.receiptFile), "utf8"));
    assert(receipt.manager === "standalone", `${target.releaseTarget} receipt manager drifted`);
    assert(receipt.version === contract.version, `${target.releaseTarget} receipt version drifted`);
    assert(receipt.target === target.releaseTarget, `${target.releaseTarget} receipt target drifted`);
    assert(receipt.executable === await realpath(join(installDir, target.executableName)), `${target.releaseTarget} receipt path was not canonical or lost spaces`);
    assert(receipt.sha256 === createHash("sha256").update(fixture.executable).digest("hex"), `${target.releaseTarget} receipt digest drifted`);
  }

  const beforeUnsupported = requests.length;
  const unsupported = await run("sh", [resolve(repositoryRoot, "installers/install.sh")], {
    KASB_INSTALLER_API_BASE: base,
    KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS: "1",
    KASB_INSTALLER_TEST_OS: "Plan9",
    KASB_INSTALLER_TEST_ARCH: "mips",
    KASB_INSTALL_DIR: join(root, "unsupported"),
  });
  assert(unsupported.code !== 0 && unsupported.stderr.includes("unsupported standalone target"), "unsupported shell target was accepted");
  assert(requests.length === beforeUnsupported, "unsupported shell target contacted the release source");

  const target = contract.targets.find(({ npmPlatform, npmArch }) => npmPlatform === "linux" && npmArch === "x64");
  const fixture = await fixtureFor(target);

  configureRelease(fixture);
  const relativeInstallAbsolute = join(root, "relative install path");
  const relativeInstallDir = relative(repositoryRoot, relativeInstallAbsolute);
  const relativeInstall = await runShell(target, relativeInstallDir);
  assert(relativeInstall.code === 0, `relative shell install failed: ${relativeInstall.stderr}`);
  const relativeReceipt = JSON.parse(await readFile(join(relativeInstallAbsolute, contract.release.receiptFile), "utf8"));
  const canonicalExecutable = await realpath(join(relativeInstallAbsolute, target.executableName));
  assert(isAbsolute(relativeReceipt.executable), "relative shell install serialized a relative executable path");
  assert(relativeReceipt.executable === canonicalExecutable, "relative shell install receipt did not preserve canonical executable identity");
  const otherCwd = join(root, "different working directory");
  await mkdir(otherCwd);
  const originalCwd = process.cwd();
  try {
    process.chdir(otherCwd);
    assert((await readFile(relativeReceipt.executable)).equals(fixture.executable), "relative shell receipt was not resolvable from another working directory");
  } finally {
    process.chdir(originalCwd);
  }

  configureRelease(fixture, { archiveBody: Buffer.from("corrupt") });
  const corruptDir = join(root, "corrupt");
  const corrupt = await runShell(target, corruptDir);
  assert(corrupt.code !== 0 && corrupt.stderr.includes("checksum mismatch"), "corrupt shell download was accepted");
  await assertMissing(join(corruptDir, target.executableName), "early shell failure left a fresh executable");
  await assertMissing(join(corruptDir, contract.release.receiptFile), "early shell failure left a fresh receipt");

  const existingEarlyFailureDir = join(root, "existing early shell failure");
  await mkdir(existingEarlyFailureDir, { recursive: true });
  const existingEarlyExecutable = join(existingEarlyFailureDir, target.executableName);
  const existingEarlyReceipt = join(existingEarlyFailureDir, contract.release.receiptFile);
  await writeFile(existingEarlyExecutable, "existing binary\n");
  await writeFile(existingEarlyReceipt, "existing receipt\n");
  const existingEarlyFailure = await runShell(target, existingEarlyFailureDir);
  assert(existingEarlyFailure.code !== 0 && existingEarlyFailure.stderr.includes("checksum mismatch"), "seeded early shell failure unexpectedly succeeded");
  assert(await readFile(existingEarlyExecutable, "utf8") === "existing binary\n", "early shell failure changed the existing executable");
  assert(await readFile(existingEarlyReceipt, "utf8") === "existing receipt\n", "early shell failure changed the existing receipt");

  configureRelease(fixture, { immutable: false });
  const mutable = await runShell(target, join(root, "mutable"));
  assert(mutable.code !== 0 && mutable.stderr.includes("not immutable"), "mutable shell release was accepted");

  configureRelease(fixture, { immutable: false, body: `spoof {"immutable":true,"tag_name":"${releaseTag(contract.release, contract.version)}"}` });
  const spoofed = await runShell(target, join(root, "spoofed release body"));
  assert(spoofed.code !== 0 && spoofed.stderr.includes("not immutable"), "release body text spoofed shell metadata trust fields");

  configureRelease(fixture, { prerelease: true });
  const prerelease = await runShell(target, join(root, "prerelease"));
  assert(prerelease.code !== 0 && prerelease.stderr.includes("not a production release"), "prerelease shell release was accepted");

  configureRelease(fixture, { omitArchive: true });
  const missing = await runShell(target, join(root, "missing"));
  assert(missing.code !== 0 && missing.stderr.includes("archive is missing"), "missing shell archive was accepted");

  configureRelease(fixture, { duplicateArchive: true });
  const duplicatedAsset = await runShell(target, join(root, "duplicated archive metadata"));
  assert(duplicatedAsset.code !== 0 && duplicatedAsset.stderr.includes("missing or duplicated"), "duplicated shell archive metadata was accepted");

  configureRelease(fixture, { archiveSizeDelta: 1 });
  const mismatchedSize = await runShell(target, join(root, "mismatched archive size"));
  assert(mismatchedSize.code !== 0 && mismatchedSize.stderr.includes("size identity mismatch"), "mismatched shell archive size was accepted");

  const duplicateFixture = await fixtureFor(target, { duplicateExecutable: true });
  configureRelease(duplicateFixture);
  const duplicate = await runShell(target, join(root, "duplicate executable"));
  assert(duplicate.code !== 0 && duplicate.stderr.includes("entry set or executable identity"), "duplicate shell archive executable was accepted");

  const expandedFixture = await fixtureFor(target, { executable: Buffer.alloc(2048, 0x41) });
  configureRelease(expandedFixture);
  const expanded = await runShell(target, join(root, "expanded executable"), { KASB_INSTALLER_TEST_EXPANDED_LIMIT_BYTES: "1024" });
  assert(expanded.code !== 0 && expanded.stderr.includes("expanded release executable exceeds"), "oversized expanded shell executable was accepted");

  const expansionBombFixture = await fixtureFor(target, { supportBody: Buffer.alloc(16384, 0x42) });
  configureRelease(expansionBombFixture);
  const expansionBomb = await runShell(target, join(root, "support entry expansion bomb"), { KASB_INSTALLER_TEST_TOTAL_EXPANDED_LIMIT_BYTES: "4096" });
  assert(expansionBomb.code !== 0 && expansionBomb.stderr.includes("expanded release archive exceeds total size"), "oversized non-executable shell archive expansion was accepted");

  const floodingFixture = await fixtureFor(target, { executable: Buffer.from("#!/bin/sh\nwhile :; do printf 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; done\n") });
  configureRelease(floodingFixture);
  const flooding = await runShell(target, join(root, "identity output flood"));
  assert(flooding.code !== 0 && flooding.stderr.includes("identity"), "shell identity output flood was accepted");

  const inheritedPipeFixture = await fixtureFor(target, { executable: Buffer.from(`#!/bin/sh\n(sleep 6) &\necho 'kasb ${contract.version}'\n`) });
  configureRelease(inheritedPipeFixture);
  const inheritedPipe = await runShell(target, join(root, "inherited identity pipe"));
  assert(inheritedPipe.code !== 0 && inheritedPipe.stderr.includes("pipe did not close"), "shell inherited identity output pipe was accepted");

  const noisyFixture = await fixtureFor(target, {
    executable: Buffer.from("#!/bin/sh\nif [ \"$1\" = --version ]; then while :; do printf 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; done; fi\nexit 1\n"),
  });
  configureRelease(noisyFixture);
  const noisyIdentity = await runShell(target, join(root, "noisy executable identity"));
  assert(noisyIdentity.code !== 0 && noisyIdentity.stderr.includes("identity output is too large"), `unbounded shell executable identity output was accepted: ${JSON.stringify(noisyIdentity)}`);

  configureRelease(fixture, { metadataBody: Buffer.alloc(contract.release.metadataLimitBytes + 1, 0x20) });
  const oversizedMetadata = await runShell(target, join(root, "oversized metadata"));
  assert(oversizedMetadata.code !== 0, "oversized shell release metadata was accepted");

  configureRelease(fixture);
  const interruptedDir = join(root, "interrupted install");
  await mkdir(interruptedDir, { recursive: true });
  const oldExecutable = join(interruptedDir, target.executableName);
  const oldReceipt = join(interruptedDir, contract.release.receiptFile);
  await writeFile(oldExecutable, "old binary\n");
  await writeFile(oldReceipt, "old receipt\n");
  const interrupted = await runShell(target, interruptedDir, { KASB_INSTALLER_TEST_INTERRUPT_AFTER_BACKUP: "1" });
  assert(interrupted.code !== 0, "interrupted shell installation succeeded");
  assert(await readFile(oldExecutable, "utf8") === "old binary\n", "interrupted shell install did not restore executable");
  assert(await readFile(oldReceipt, "utf8") === "old receipt\n", "interrupted shell install did not restore receipt");

  configureRelease(fixture);
  const symlinkRollbackDir = join(root, "relative symlink rollback");
  await mkdir(symlinkRollbackDir, { recursive: true });
  const symlinkExecutableTarget = join(root, "relative symlink executable target");
  const symlinkReceiptTarget = join(root, "relative symlink receipt target");
  await writeFile(symlinkExecutableTarget, "symlink binary\n");
  await writeFile(symlinkReceiptTarget, "symlink receipt\n");
  const symlinkExecutable = join(symlinkRollbackDir, target.executableName);
  const symlinkReceipt = join(symlinkRollbackDir, contract.release.receiptFile);
  const executableLink = `../${symlinkExecutableTarget.slice(root.length + 1)}`;
  const receiptLink = `../${symlinkReceiptTarget.slice(root.length + 1)}`;
  await symlink(executableLink, symlinkExecutable);
  await symlink(receiptLink, symlinkReceipt);
  const symlinkRollback = await runShell(target, symlinkRollbackDir, { KASB_INSTALLER_TEST_FAIL_RECEIPT_PUBLISH: "1" });
  assert(symlinkRollback.code !== 0 && symlinkRollback.stderr.includes("must be regular files"), "relative symlink shell installation was not rejected safely");
  assert(await readlink(symlinkExecutable) === executableLink, "shell rejection changed the relative executable symlink");
  assert(await readlink(symlinkReceipt) === receiptLink, "shell rejection changed the relative receipt symlink");
  assert(await readFile(symlinkExecutable, "utf8") === "symlink binary\n", "rejected executable symlink lost its referent");
  assert(await readFile(symlinkReceipt, "utf8") === "symlink receipt\n", "rejected receipt symlink lost its referent");

  configureRelease(fixture);
  const receiptFailureDir = join(root, "receipt publication failure");
  await mkdir(receiptFailureDir, { recursive: true });
  const receiptFailureExecutable = join(receiptFailureDir, target.executableName);
  const receiptFailureReceipt = join(receiptFailureDir, contract.release.receiptFile);
  await writeFile(receiptFailureExecutable, "old binary\n");
  await writeFile(receiptFailureReceipt, "old receipt\n");
  const receiptFailure = await runShell(target, receiptFailureDir, { KASB_INSTALLER_TEST_FAIL_RECEIPT_PUBLISH: "1" });
  assert(receiptFailure.code !== 0, "shell receipt publication failure succeeded");
  assert(await readFile(receiptFailureExecutable, "utf8") === "old binary\n", "shell receipt failure did not restore executable");
  assert(await readFile(receiptFailureReceipt, "utf8") === "old receipt\n", "shell receipt failure did not restore receipt");

  configureRelease(fixture);
  const incompleteRollbackDir = join(root, "incomplete rollback");
  await mkdir(incompleteRollbackDir, { recursive: true });
  await writeFile(join(incompleteRollbackDir, target.executableName), "old binary\n");
  await writeFile(join(incompleteRollbackDir, contract.release.receiptFile), "old receipt\n");
  const incompleteRollback = await runShell(target, incompleteRollbackDir, {
    KASB_INSTALLER_TEST_FAIL_RECEIPT_PUBLISH: "1",
    KASB_INSTALLER_TEST_FAIL_ROLLBACK: "1",
  });
  assert(incompleteRollback.code !== 0 && incompleteRollback.stderr.includes("recovery files remain"), "incomplete shell rollback was not surfaced");
  const recoveryDirectories = (await readdir(incompleteRollbackDir)).filter((name) => name.startsWith(".kasb-install."));
  assert(recoveryDirectories.length === 1, "incomplete shell rollback did not preserve exactly one recovery directory");
  const recoveryDirectory = join(incompleteRollbackDir, recoveryDirectories[0]);
  assert(await readFile(join(recoveryDirectory, "previous-kasb"), "utf8") === "old binary\n", "incomplete shell rollback lost the executable backup");
  assert(await readFile(join(recoveryDirectory, "previous-receipt"), "utf8") === "old receipt\n", "incomplete shell rollback lost the receipt backup");

  configureRelease(fixture);
  const failedFreshDir = join(root, "fresh receipt publish failure");
  const failedFresh = await runShell(target, failedFreshDir, { KASB_INSTALLER_TEST_FAIL_RECEIPT_PUBLISH: "1" });
  assert(failedFresh.code !== 0, "fresh shell receipt publication failure succeeded");
  await assertMissing(join(failedFreshDir, target.executableName), "fresh shell rollback left a newly installed executable");
  await assertMissing(join(failedFreshDir, contract.release.receiptFile), "fresh shell rollback left a new receipt");

  const insecure = await run("sh", [resolve(repositoryRoot, "installers/install.sh")], {
    KASB_INSTALLER_API_BASE: base,
    KASB_INSTALLER_DOWNLOAD_BASE: base,
    KASB_INSTALLER_TEST_OS: "Linux",
    KASB_INSTALLER_TEST_ARCH: "x86_64",
    KASB_INSTALL_DIR: join(root, "insecure rejected"),
  });
  assert(insecure.code !== 0 && insecure.stderr.includes("test-only"), "shell installer accepted a URL override without the explicit test flag");

  for (const [name, options, expected, replacement] of [
    ["immutable", { immutable: false }, '"immutable":false', '"immutable":false,"immutable":true'],
    ["draft", { draft: true }, '"draft":true', '"draft":true,"draft":false'],
    ["prerelease", { prerelease: true }, '"prerelease":true', '"prerelease":true,"prerelease":false'],
    ["tag", { tagName: "v9.9.9" }, '"tag_name":"v9.9.9"', `"tag_name":"v9.9.9","tag_name":"${releaseTag(contract.release, contract.version)}"`],
  ]) {
    configureRelease(fixture, {
      ...options,
      metadataBody: (metadata) => duplicateJsonKey(metadata, expected, replacement),
    });
    const spoofed = await runShell(target, join(root, `spoofed ${name}`));
    assert(spoofed.code !== 0, `duplicate ${name} metadata token was accepted`);
  }

  configureRelease(fixture, {
    omitArchive: true,
    metadataBody: (metadata) => Buffer.from(JSON.stringify({ ...metadata, body: { name: target.archiveName } })),
  });
  const spoofedAsset = await runShell(target, join(root, "spoofed asset"));
  assert(spoofedAsset.code !== 0 && spoofedAsset.stderr.includes("archive is missing"), "asset name outside the assets array was accepted");
  }

  await validatePowerShellInstaller();
  console.log("installer target selection, checksums, receipts, rollback, and PowerShell contract passed");
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(root, { recursive: true, force: true });
}

async function fixtureFor(target, options = {}) {
  const source = join(root, `archive-${target.releaseTarget}`);
  await mkdir(source, { recursive: true });
  const executablePath = join(source, target.executableName);
  const executable = options.executable ?? (process.platform === "win32"
    ? await readFile(resolve(repositoryRoot, "target/debug/kasb.exe"))
    : Buffer.from(`#!/bin/sh\nif [ "$1" = --version ]; then echo 'kasb ${contract.version}'; exit 0; fi\nexit 1\n`));
  await writeFile(executablePath, executable);
  await chmod(executablePath, 0o755);
  const supportFiles = ["LICENSE.md", "README.md", "THIRD_PARTY_LICENSES.html"];
  for (const name of supportFiles) await writeFile(join(source, name), options.supportBody ?? `${name} fixture\n`);
  const archivePath = join(root, target.archiveName);
  const entries = options.duplicateExecutable
    ? [target.executableName, ...supportFiles, target.executableName]
    : [target.executableName, ...supportFiles];
  const tar = spawnSync("tar", ["-czf", archivePath, ...entries], { cwd: source, encoding: "utf8" });
  assert(tar.status === 0, `could not create fixture archive: ${tar.stderr}`);
  const archive = await readFile(archivePath);
  const digest = createHash("sha256").update(archive).digest("hex");
  return { target, executable, archive, checksums: Buffer.from(`${digest}  ${target.archiveName}\n`) };
}

function configureRelease(fixture, options = {}) {
  routes.clear();
  const { target, archive, checksums } = fixture;
  const tag = releaseTag(contract.release, contract.version);
  const downloadUrl = (name) => `https://github.com/${contract.release.repository}/releases/download/${tag}/${name}`;
  const archiveAsset = {
    name: target.archiveName,
    size: (options.archiveBody ?? archive).length + (options.archiveSizeDelta ?? 0),
    browser_download_url: downloadUrl(target.archiveName),
  };
  const assets = [
    ...(!options.omitArchive ? [archiveAsset] : []),
    ...(options.duplicateArchive ? [archiveAsset] : []),
    { name: contract.release.checksumAsset, size: checksums.length + (options.checksumSizeDelta ?? 0), browser_download_url: downloadUrl(contract.release.checksumAsset) },
  ];
  const metadata = {
    tag_name: options.tagName ?? tag,
    immutable: options.immutable ?? true,
    draft: options.draft ?? false,
    prerelease: options.prerelease ?? false,
    body: options.body ?? "fixture release",
    assets,
  };
  routes.set(`/repos/${contract.release.repository}/releases/tags/${tag}`, {
    type: "application/json",
    body: typeof options.metadataBody === "function" ? options.metadataBody(metadata) : options.metadataBody ?? Buffer.from(JSON.stringify(metadata)),
  });
  routes.set(`/${contract.release.repository}/releases/download/${tag}/${target.archiveName}`, {
    body: options.archiveBody ?? archive,
  });
  routes.set(`/${contract.release.repository}/releases/download/${tag}/${contract.release.checksumAsset}`, {
    body: checksums,
  });
}

function duplicateJsonKey(metadata, expected, replacement) {
  const body = JSON.stringify(metadata);
  assert(body.includes(expected), `spoof fixture lacks ${expected}`);
  return Buffer.from(body.replace(expected, replacement));
}

function runShell(target, installDir, extra = {}) {
  return run("sh", [resolve(repositoryRoot, "installers/install.sh")], {
    KASB_INSTALLER_API_BASE: base,
    KASB_INSTALLER_DOWNLOAD_BASE: base,
    KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS: "1",
    KASB_INSTALLER_TEST_OS: target.npmPlatform === "darwin" ? "Darwin" : "Linux",
    KASB_INSTALLER_TEST_ARCH: target.npmArch === "x64" ? "x86_64" : "aarch64",
    KASB_INSTALL_DIR: installDir,
    ...extra,
  });
}

async function validatePowerShellInstaller() {
  const text = await readFile(resolve(repositoryRoot, "installers/install.ps1"), "utf8");
  for (const target of contract.targets) assert(text.includes(target.archiveName), `PowerShell installer lacks ${target.archiveName}`);
  for (const required of ["immutable", "Get-FileHash", "schemaVersion", "manager = 'standalone'", "Save-BoundedReleaseFile", "ResponseHeadersRead", "Move-ExactFile", "finally", "Extract-TarExecutable", "pre-existing installation paths must be regular files", ".kasb-install."]) {
    assert(text.includes(required), `PowerShell installer lacks ${required} contract`);
  }
  assert(!/\btar\s+-/u.test(text), "PowerShell installer depends on an external tar executable");
  const executable = process.platform === "win32"
    ? "powershell.exe"
    : spawnSync("sh", ["-c", "command -v pwsh"], { encoding: "utf8" }).stdout.trim();
  if (!executable) {
    if (process.env.KASB_REQUIRE_POWERSHELL_TESTS === "1") throw new Error("PowerShell installer behavior tests were required but pwsh is unavailable");
    return;
  }
  const syntax = await run(executable, ["-NoLogo", "-NoProfile", "-Command", `$tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseFile('${resolve(repositoryRoot, "installers/install.ps1").replaceAll("'", "''")}', [ref]$tokens, [ref]$errors) | Out-Null; if ($errors.Count) { $errors | Out-String | Write-Error; exit 1 }`]);
  assert(syntax.code === 0, `PowerShell installer syntax failed: ${syntax.stderr}`);

  const behaviorTargets = process.platform === "win32"
    ? contract.targets.filter(({ npmPlatform }) => npmPlatform === "win32")
    : contract.targets;
  for (const target of behaviorTargets) {
    const fixture = await fixtureFor(target);
    configureRelease(fixture);
    const installDir = join(root, `PowerShell ${target.releaseTarget} path with spaces`);
    const result = await runPowerShell(executable, target, installDir);
    assert(result.code === 0, `${target.releaseTarget} PowerShell install failed: ${result.stderr}`);
    const receipt = JSON.parse(await readFile(join(installDir, contract.release.receiptFile), "utf8"));
    assert(receipt.manager === "standalone", `${target.releaseTarget} PowerShell receipt manager drifted`);
    assert(receipt.version === contract.version, `${target.releaseTarget} PowerShell receipt version drifted`);
    assert(receipt.target === target.releaseTarget, `${target.releaseTarget} PowerShell receipt target drifted`);
    assert(receipt.sha256 === createHash("sha256").update(fixture.executable).digest("hex"), `${target.releaseTarget} PowerShell receipt digest drifted`);
  }

  const target = contract.targets.find(({ npmPlatform, npmArch }) => npmPlatform === "win32" && npmArch === "x64");
  const fixture = await fixtureFor(target);
  const beforeUnsupported = requests.length;
  const unsupported = await runPowerShell(executable, target, join(root, "PowerShell unsupported"), {
    KASB_INSTALLER_TEST_PLATFORM: "Plan9",
    KASB_INSTALLER_TEST_ARCH: "Mips",
  });
  assert(unsupported.code !== 0, "unsupported PowerShell target was accepted");
  assert(requests.length === beforeUnsupported, "unsupported PowerShell target contacted the release source");

  configureRelease(fixture, { archiveBody: Buffer.from("corrupt") });
  const corruptDir = join(root, "PowerShell corrupt");
  assert((await runPowerShell(executable, target, corruptDir)).code !== 0, "corrupt PowerShell download was accepted");
  await assertMissing(join(corruptDir, target.executableName), "early PowerShell failure left a fresh executable");
  await assertMissing(join(corruptDir, contract.release.receiptFile), "early PowerShell failure left a fresh receipt");

  const existingEarlyFailureDir = join(root, "PowerShell existing early failure");
  await mkdir(existingEarlyFailureDir, { recursive: true });
  const existingEarlyExecutable = join(existingEarlyFailureDir, target.executableName);
  const existingEarlyReceipt = join(existingEarlyFailureDir, contract.release.receiptFile);
  await writeFile(existingEarlyExecutable, "existing binary\n");
  await writeFile(existingEarlyReceipt, "existing receipt\n");
  const existingEarlyFailure = await runPowerShell(executable, target, existingEarlyFailureDir);
  assert(existingEarlyFailure.code !== 0, "seeded early PowerShell failure unexpectedly succeeded");
  assert(await readFile(existingEarlyExecutable, "utf8") === "existing binary\n", "early PowerShell failure changed the existing executable");
  assert(await readFile(existingEarlyReceipt, "utf8") === "existing receipt\n", "early PowerShell failure changed the existing receipt");
  configureRelease(fixture, { immutable: false });
  assert((await runPowerShell(executable, target, join(root, "PowerShell mutable"))).code !== 0, "mutable PowerShell release was accepted");
  for (const [name, mutate] of [
    ["string immutable", (metadata) => ({ ...metadata, immutable: "true" })],
    ["missing draft", ({ draft: _draft, ...metadata }) => metadata],
    ["string prerelease", (metadata) => ({ ...metadata, prerelease: "false" })],
  ]) {
    configureRelease(fixture, { metadataBody: (metadata) => Buffer.from(JSON.stringify(mutate(metadata))) });
    assert((await runPowerShell(executable, target, join(root, `PowerShell ${name}`))).code !== 0, `${name} PowerShell release flags were accepted`);
  }
  configureRelease(fixture, { omitArchive: true });
  assert((await runPowerShell(executable, target, join(root, "PowerShell missing"))).code !== 0, "missing PowerShell archive was accepted");
  configureRelease(fixture, { duplicateArchive: true });
  assert((await runPowerShell(executable, target, join(root, "PowerShell duplicated archive metadata"))).code !== 0, "duplicated PowerShell archive metadata was accepted");
  configureRelease(fixture, { archiveSizeDelta: 1 });
  assert((await runPowerShell(executable, target, join(root, "PowerShell mismatched archive size"))).code !== 0, "mismatched PowerShell archive size was accepted");
  configureRelease(fixture, { metadataBody: Buffer.alloc(contract.release.metadataLimitBytes + 1, 0x20) });
  assert((await runPowerShell(executable, target, join(root, "PowerShell oversized metadata"))).code !== 0, "oversized PowerShell release metadata was accepted");

  if (process.platform !== "win32") {
    configureRelease(fixture);
    const symlinkDir = join(root, "PowerShell relative symlink rejection");
    await mkdir(symlinkDir, { recursive: true });
    const executableTarget = join(root, "PowerShell symlink executable target");
    const receiptTarget = join(root, "PowerShell symlink receipt target");
    await writeFile(executableTarget, "symlink binary\n");
    await writeFile(receiptTarget, "symlink receipt\n");
    const executablePath = join(symlinkDir, target.executableName);
    const receiptPath = join(symlinkDir, contract.release.receiptFile);
    const executableLink = `../${executableTarget.slice(root.length + 1)}`;
    const receiptLink = `../${receiptTarget.slice(root.length + 1)}`;
    await symlink(executableLink, executablePath);
    await symlink(receiptLink, receiptPath);
    const rejected = await runPowerShell(executable, target, symlinkDir, { KASB_INSTALLER_TEST_FAIL_RECEIPT_PUBLISH: "1" });
    assert(rejected.code !== 0 && rejected.stderr.includes("must be regular files"), "PowerShell accepted pre-existing symlink installation paths");
    assert(await readlink(executablePath) === executableLink, "PowerShell rejection changed the executable symlink");
    assert(await readlink(receiptPath) === receiptLink, "PowerShell rejection changed the receipt symlink");
  }

  const floodingExecutable = process.platform === "win32"
    ? await compileWindowsIdentityProbe("flood")
    : Buffer.from("#!/bin/sh\nwhile :; do printf 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; done\n");
  const floodingFixture = await fixtureFor(target, { executable: floodingExecutable });
  configureRelease(floodingFixture);
  assert((await runPowerShell(executable, target, join(root, "PowerShell identity output flood"))).code !== 0, "PowerShell identity output flood was accepted");

  const inheritedPipeExecutable = process.platform === "win32"
    ? await compileWindowsIdentityProbe("inherit")
    : Buffer.from(`#!/bin/sh\n(sleep 6) &\necho 'kasb ${contract.version}'\n`);
  const inheritedPipeFixture = await fixtureFor(target, { executable: inheritedPipeExecutable });
  configureRelease(inheritedPipeFixture);
  assert((await runPowerShell(executable, target, join(root, "PowerShell inherited identity pipe"))).code !== 0, "PowerShell inherited identity output pipe was accepted");

  if (process.platform !== "win32") {
    const noisyTarget = contract.targets.find(({ npmPlatform, npmArch }) => npmPlatform === "linux" && npmArch === "x64");
    const noisyFixture = await fixtureFor(noisyTarget, {
      executable: Buffer.from("#!/bin/sh\nif [ \"$1\" = --version ]; then while :; do printf 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; printf 'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy' >&2; done; fi\nexit 1\n"),
    });
    configureRelease(noisyFixture);
    const noisyIdentity = await runPowerShell(executable, noisyTarget, join(root, "PowerShell noisy executable identity"));
    assert(noisyIdentity.code !== 0 && noisyIdentity.stderr.includes("identity output is too large"), `unbounded PowerShell executable identity output was accepted: ${JSON.stringify(noisyIdentity)}`);
  }

  for (const [name, hook] of [
    ["interrupted", "KASB_INSTALLER_TEST_INTERRUPT_AFTER_BACKUP"],
    ["receipt failure", "KASB_INSTALLER_TEST_FAIL_RECEIPT_PUBLISH"],
  ]) {
    configureRelease(fixture);
    const installDir = join(root, `PowerShell ${name}`);
    await mkdir(installDir, { recursive: true });
    const oldExecutable = join(installDir, target.executableName);
    const oldReceipt = join(installDir, contract.release.receiptFile);
    await writeFile(oldExecutable, "old binary\n");
    await writeFile(oldReceipt, "old receipt\n");
    const result = await runPowerShell(executable, target, installDir, { [hook]: "1" });
    assert(result.code !== 0, `PowerShell ${name} succeeded`);
    assert(await readFile(oldExecutable, "utf8") === "old binary\n", `PowerShell ${name} did not restore executable`);
    assert(await readFile(oldReceipt, "utf8") === "old receipt\n", `PowerShell ${name} did not restore receipt`);
  }

  configureRelease(fixture);
  const incompleteRollbackDir = join(root, "PowerShell incomplete rollback");
  await mkdir(incompleteRollbackDir, { recursive: true });
  await writeFile(join(incompleteRollbackDir, target.executableName), "old binary\n");
  await writeFile(join(incompleteRollbackDir, contract.release.receiptFile), "old receipt\n");
  const incompleteRollback = await runPowerShell(executable, target, incompleteRollbackDir, {
    KASB_INSTALLER_TEST_FAIL_RECEIPT_PUBLISH: "1",
    KASB_INSTALLER_TEST_FAIL_ROLLBACK: "1",
  });
  assert(incompleteRollback.code !== 0 && incompleteRollback.stderr.includes("recovery files remain"), "incomplete PowerShell rollback was not surfaced");
  const recoveryDirectories = (await readdir(incompleteRollbackDir)).filter((name) => name.startsWith(".kasb-install."));
  assert(recoveryDirectories.length === 1, "incomplete PowerShell rollback did not preserve exactly one recovery directory");
  const recoveryDirectory = join(incompleteRollbackDir, recoveryDirectories[0]);
  assert(await readFile(join(recoveryDirectory, "previous-kasb"), "utf8") === "old binary\n", "incomplete PowerShell rollback lost the executable backup");
  assert(await readFile(join(recoveryDirectory, "previous-receipt"), "utf8") === "old receipt\n", "incomplete PowerShell rollback lost the receipt backup");

  configureRelease(fixture);
  const failedFreshDir = join(root, "PowerShell fresh receipt failure");
  const failedFresh = await runPowerShell(executable, target, failedFreshDir, { KASB_INSTALLER_TEST_FAIL_RECEIPT_PUBLISH: "1" });
  assert(failedFresh.code !== 0, "fresh PowerShell receipt publication failure succeeded");
  await assertMissing(join(failedFreshDir, target.executableName), "fresh PowerShell rollback left a newly installed executable");
  await assertMissing(join(failedFreshDir, contract.release.receiptFile), "fresh PowerShell rollback left a new receipt");
}

function runPowerShell(executable, target, installDir, extra = {}) {
  const platform = target.npmPlatform === "win32" ? "Win32NT" : target.npmPlatform === "darwin" ? "Unix:OSX" : "Unix:Linux";
  const arch = target.npmArch === "x64" ? "X64" : "Arm64";
  return run(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", resolve(repositoryRoot, "installers/install.ps1")], {
    KASB_INSTALLER_API_BASE: base,
    KASB_INSTALLER_DOWNLOAD_BASE: base,
    KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS: "1",
    KASB_INSTALLER_TEST_PLATFORM: platform,
    KASB_INSTALLER_TEST_ARCH: arch,
    KASB_INSTALL_DIR: installDir,
    ...extra,
  });
}

async function compileWindowsIdentityProbe(mode) {
  const source = join(root, `identity-probe-${mode}.rs`);
  const executable = join(root, `identity-probe-${mode}.exe`);
  const body = mode === "flood"
    ? `use std::io::Write; fn main() { let mut output = std::io::stdout().lock(); loop { output.write_all(b"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx").unwrap(); output.flush().unwrap(); } }\n`
    : `use std::process::Command; fn main() { let _ = Command::new("powershell.exe").args(["-NoLogo", "-NoProfile", "-Command", "Start-Sleep -Seconds 6"]).spawn().unwrap(); println!("kasb ${contract.version}"); }\n`;
  await writeFile(source, body);
  const compiled = spawnSync("rustc", ["--edition=2021", source, "-o", executable], { encoding: "utf8" });
  assert(compiled.status === 0, `could not compile Windows identity probe: ${compiled.stderr}`);
  return readFile(executable);
}

async function assertMissing(path, message) {
  try {
    await readFile(path);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(message);
}

function run(command, args, environment = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { cwd: repositoryRoot, env: { ...process.env, ...environment } });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("close", (code) => resolveRun({ code, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") }));
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
