import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { access, constants, lstat, mkdir, mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

import { localTarDestination, localTarInvocation } from "./local-archive-path.mjs";
import { loadReleaseContract, releaseTag, repositoryRoot } from "./release-contract.mjs";

const rustTarget = process.argv[2];
if (!rustTarget) {
  throw new Error("Usage: node scripts/test-release-candidate-consumer.mjs <rust-target> [archive-or-directory]");
}

const contract = await loadReleaseContract();
const target = contract.targets.find((candidate) => candidate.rustTarget === rustTarget);
if (!target) throw new Error(`Unknown native target: ${rustTarget}`);
assert.equal(process.platform, target.npmPlatform, `candidate runner platform must be ${target.npmPlatform}`);
assert.equal(process.arch, target.npmArch, `candidate runner architecture must be ${target.npmArch}`);

const candidateRoot = resolve(repositoryRoot, process.argv[3] ?? "dist");
const archive = await resolveArchive(resolve(candidateRoot, "cli"));
const archiveBytes = await readFile(archive);
const archiveDigest = sha256(archiveBytes);
const checksums = await readFile(resolve(candidateRoot, "cli", contract.release.checksumAsset));
const candidate = JSON.parse(await readFile(resolve(candidateRoot, "release", contract.release.candidateReceiptFile), "utf8"));
assert.equal(candidate.version, contract.version);
assert.equal(
  candidate.commit,
  process.env.KASB_CANDIDATE_SHA ?? process.env.GITHUB_SHA,
  "candidate receipt must bind the checked-out commit",
);
const tag = releaseTag(contract.release, contract.version);
const requests = [];
const metadata = Buffer.from(JSON.stringify({
  tag_name: tag,
  immutable: true,
  draft: false,
  prerelease: false,
  assets: [
    ...candidate.githubAssets.map(({ name, size, sha256: digest }) => ({
      name,
      size,
      digest: `sha256:${digest}`,
      browser_download_url: `https://github.com/${contract.release.repository}/releases/download/${tag}/${name}`,
    })),
  ],
}));
const routes = new Map([
  [`/repos/${contract.release.repository}/releases/tags/${tag}`, { body: metadata, type: "application/json" }],
  [`/repos/${contract.release.repository}/releases/latest`, { body: metadata, type: "application/json" }],
  [`/${contract.release.repository}/releases/download/${tag}/${target.archiveName}`, { body: archiveBytes }],
  [`/${contract.release.repository}/releases/download/${tag}/${contract.release.checksumAsset}`, { body: checksums }],
]);
const server = createServer((request, response) => {
  requests.push(request.url);
  const route = routes.get(request.url);
  if (!route) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    "content-length": route.body.length,
    "content-type": route.type ?? "application/octet-stream",
  });
  response.end(route.body);
});
await new Promise((ready, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", ready);
});
const base = `http://127.0.0.1:${server.address().port}`;
const temporary = await mkdtemp(resolve(candidateRoot, ".kasb-exact-candidate-"));

try {
  const extracted = resolve(temporary, "archive");
  const installDirectory = resolve(temporary, "installed path with spaces");
  await mkdir(extracted, { recursive: true });
  const extractionDirectory = localTarDestination(archive, extracted);
  const extractionCommand = localTarInvocation(archive, "-xzf", ["-C", extractionDirectory]);
  const extraction = await run("tar", extractionCommand.args, extractionCommand.options);
  assertProcessSucceeded(extraction, "exact candidate archive extraction");

  const installerEnvironment = {
    ...process.env,
    KASB_INSTALLER_API_BASE: base,
    KASB_INSTALLER_DOWNLOAD_BASE: base,
    KASB_INSTALLER_TEST_ALLOW_NONCANONICAL_URLS: "1",
    KASB_INSTALL_DIR: installDirectory,
  };
  const installerPath = resolve(candidateRoot, "installers", process.platform === "win32" ? contract.release.powershellInstallerAsset : contract.release.shellInstallerAsset);
  const installer = process.platform === "win32"
    ? await run("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", installerPath], { env: installerEnvironment })
    : await run("sh", [installerPath], { env: installerEnvironment });
  assertProcessSucceeded(installer, `${process.platform === "win32" ? "PowerShell" : "shell"} candidate installer`);

  const exactExecutable = resolve(extracted, target.executableName);
  const installedExecutable = resolve(installDirectory, target.executableName);
  if (process.platform !== "win32") {
    await access(exactExecutable, constants.X_OK);
    await access(installedExecutable, constants.X_OK);
  }
  const exactExecutableBytes = await readFile(exactExecutable);
  const installedExecutableBytes = await readFile(installedExecutable);
  assert.deepEqual(installedExecutableBytes, exactExecutableBytes, "installer must preserve the exact candidate executable bytes");

  const receiptPath = resolve(installDirectory, contract.release.receiptFile);
  const receiptBytes = await readFile(receiptPath);
  const receipt = JSON.parse(receiptBytes.toString("utf8"));
  assert.deepEqual(Object.keys(receipt).sort(), [
    "assetName", "executable", "manager", "releaseRepository", "releaseTag", "schemaVersion", "sha256", "target", "version",
  ].sort(), "candidate receipt field set drifted");
  assert.equal(receipt.schemaVersion, contract.release.receiptSchemaVersion);
  assert.equal(receipt.manager, "standalone");
  assert.equal(receipt.version, contract.version);
  assert.equal(receipt.target, target.releaseTarget);
  assert.equal(receipt.releaseRepository, contract.release.repository);
  assert.equal(receipt.releaseTag, tag);
  assert.equal(receipt.assetName, target.archiveName);
  assert.equal(receipt.sha256, sha256(exactExecutableBytes));
  assert.equal(await realpath(receipt.executable), await realpath(installedExecutable));

  for (const args of [["--version"], ["--help"], ["not-a-command"]]) {
    const [direct, installed] = await Promise.all([
      run(exactExecutable, args),
      run(installedExecutable, args),
    ]);
    for (const field of ["status", "signal", "stdout", "stderr"]) {
      assert.deepEqual(installed[field], direct[field], `installed candidate must preserve CLI ${field} for ${args.join(" ")}`);
    }
  }

  for (const [args, operation] of [
    [["upgrade", "--check"], "upgrade-check"],
    [["upgrade"], "upgrade"],
  ]) {
    const upgrade = await run(installedExecutable, args, {
      env: {
        ...process.env,
        KASB_UPGRADE_TEST_ALLOW_NONCANONICAL_URLS: "1",
        KASB_UPGRADE_TEST_LATEST_URL: `${base}/repos/${contract.release.repository}/releases/latest`,
      },
    });
    assertProcessSucceeded(upgrade, `managed candidate ${operation}`);
    const upgradeResult = JSON.parse(upgrade.stdout).result;
    assert.deepEqual(upgradeResult, {
      operation,
      managed: true,
      currentVersion: contract.version,
      latestVersion: contract.version,
      updateAvailable: false,
      releaseTag: tag,
      releaseRepository: contract.release.repository,
      target: target.releaseTarget,
    });
    assert.deepEqual(await readFile(installedExecutable), installedExecutableBytes, `same-version ${operation} must not change the managed binary`);
    assert.deepEqual(await readFile(receiptPath), receiptBytes, `same-version ${operation} must not change the managed receipt`);
  }

  for (const requiredPath of routes.keys()) {
    assert(requests.includes(requiredPath), `candidate consumer did not exercise ${requiredPath}`);
  }
  console.log(`exact standalone candidate consumer passed ${rustTarget}`);
} finally {
  await new Promise((closed) => server.close(closed));
  await rm(temporary, { recursive: true, force: true });
}

async function resolveArchive(input) {
  const path = resolve(repositoryRoot, input);
  const metadata = await stat(path);
  const candidate = metadata.isDirectory() ? resolve(path, target.archiveName) : path;
  assert(!(await lstat(candidate)).isSymbolicLink(), "candidate archive must not be a symlink");
  assert.equal(resolve(dirname(candidate), target.archiveName), candidate, "candidate archive filename must be canonical");
  assert((await stat(candidate)).isFile(), "candidate archive must be a regular file");
  return candidate;
}

function run(command, args, options = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      windowsHide: true,
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback(value);
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish(reject, new Error(`Timed out after 60 seconds: ${command} ${args.join(" ")}`));
    }, 60_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => finish(reject, error));
    child.once("close", (status, signal) => finish(resolveResult, { status, signal, stdout, stderr }));
  });
}

function assertProcessSucceeded(result, operation) {
  assert.equal(result.signal, null, `${operation} terminated by ${result.signal}`);
  assert.equal(result.status, 0, `${operation} failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
