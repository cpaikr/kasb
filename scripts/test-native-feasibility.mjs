import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  chmod,
  access,
  copyFile,
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertTargetAlignment } from "../packages/node/scripts/target-alignment.mjs";
import { capabilityError } from "../packages/node/src/error.js";
import { runtimeTarget, selectNativeTarget } from "../packages/node/src/runtime-target.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = join(repositoryRoot, "packages/node");
const manifest = JSON.parse(await readFile(join(repositoryRoot, "native-targets.json"), "utf8"));
const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
const npmCommand = process.platform === "win32" ? await resolveWindowsCommand("npm.cmd") : "npm";
const host = runtimeTarget();
const target = selectNativeTarget(manifest.targets, host, manifest.minimumGlibcVersion);
assert(target, `no feasibility target for ${host.key}`);
assert.throws(
  () => assertTargetAlignment(manifest, {
    ...packageJson,
    optionalDependencies: { [target.packageName]: "9.9.9" }
  }),
  /optionalDependencies disagree|exact root package version/,
  "packed-manifest alignment must reject missing, extra, or version-skewed targets"
);
const projectedFailure = capabilityError({
  code: "source_changed",
  message: "provider changed",
  retryable: false,
  sourceUrl: "https://db.kasb.or.kr/api/standard",
  name: "InjectedName",
  stack: "injected stack",
  unknown: "must not cross"
});
assert.equal(projectedFailure.name, "KasbFailure");
assert.notEqual(projectedFailure.stack, "injected stack");
assert(!Object.hasOwn(projectedFailure, "unknown"));

const scratch = await mkdtemp(join(tmpdir(), "kasb-native-feasibility-"));
try {
  const metadata = JSON.parse(run("cargo", ["metadata", "--no-deps", "--format-version", "1"]).stdout);
  const targetDirectory = metadata.target_directory;

  run("cargo", ["build", "--locked", "-p", "kasb-node", "--features", "feasibility-judge", "--lib"]);
  const debugAddon = nativeLibrary(targetDirectory, "debug");
  const judgeAddon = join(scratch, target.addonFile);
  await copyFile(debugAddon, judgeAddon);
  await judgeBinding(judgeAddon);

  const releaseJudge = run(
    "cargo",
    ["check", "--locked", "--release", "-p", "kasb-node", "--features", "feasibility-judge"],
    { expectFailure: true }
  );
  assert.match(
    `${releaseJudge.stdout}\n${releaseJudge.stderr}`,
    /feasibility-judge probes cannot be compiled into a release artifact/,
    "release builds must reject judge-only probes"
  );

  run("cargo", ["build", "--locked", "--release", "-p", "kasb-node", "--lib", "--bin", "kasb-process-probe"]);
  run("bun", ["run", "--cwd", packageRoot, "build"]);

  const nativePackageRoot = join(scratch, "native-package");
  await assembleNativePackage(nativePackageRoot, targetDirectory);
  const launcherPackageRoot = join(scratch, "launcher-package");
  await assembleLauncherPackage(launcherPackageRoot);
  const packDirectory = join(scratch, "packs");
  await mkdir(packDirectory);
  const nativePack = pack(nativePackageRoot, packDirectory);
  const rootPack = pack(launcherPackageRoot, packDirectory);
  assertPackContents(nativePack, rootPack);

  const consumer = join(scratch, "consumer");
  await installConsumer(consumer, rootPack.tarball, nativePack.tarball, true);
  await testPackedAddon(consumer);
  await testLauncherContract(consumer, targetDirectory);
  await testSignals(consumer, targetDirectory);
  await testInstallationErrors(consumer);

  const missingConsumer = join(scratch, "consumer-missing-native");
  await installConsumer(missingConsumer, rootPack.tarball, undefined, false);
  testMissingPackage(missingConsumer);

  process.stdout.write(`native feasibility passed ${target.rustTarget} with Node ${process.version}\n`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}

function nativeLibrary(targetDirectory, profile) {
  const filename = process.platform === "win32"
    ? "kasb_node.dll"
    : process.platform === "darwin"
      ? "libkasb_node.dylib"
      : "libkasb_node.so";
  return join(targetDirectory, profile, filename);
}

function probeBinary(targetDirectory) {
  return join(
    targetDirectory,
    "release",
    process.platform === "win32" ? "kasb-process-probe.exe" : "kasb-process-probe"
  );
}

async function judgeBinding(addonPath) {
  const source = String.raw`
    const assert = require("node:assert/strict");
    const addon = require(process.argv[1]);
    (async () => {
      const valid = JSON.parse(await addon.fixtureGetParagraph(JSON.stringify({stdNum:"1116", paraNum:"23"})));
      assert.equal(valid.ok, true);
      assert.equal(valid.value.result.paragraph.stdNum, "1116");
      assert.equal(valid.value.result.paragraph.paraNum, "23");
      assert.equal(valid.value.result.paragraph.uniqueKey, "1116-23");
      assert.equal(valid.value.metadata.fetchedAt, "2026-05-18T00:00:00.000Z");

      const controller = new AbortController();
      const pending = addon.cancellationProbe(controller.signal, false);
      setTimeout(() => controller.abort(), 10);
      const cancelled = JSON.parse(await pending);
      assert.equal(cancelled.ok, false);
      assert.equal(cancelled.cancelled, true);
      assert.equal(cancelled.error.retryable, true);

      const panicked = JSON.parse(await addon.panicProbe());
      assert.equal(panicked.ok, false);
      assert.equal(panicked.error.code, "internal_failure");
      assert.equal(panicked.operatorSignal, "binding_panic");

      const invalidOperation = JSON.parse(await addon.executeOperation("unknown", "{}"));
      assert.equal(invalidOperation.ok, false);
      assert.equal(invalidOperation.error.parameter, "operationName");
    })().catch((error) => { console.error(error); process.exitCode = 1; });
  `;
  const result = run(process.execPath, ["-e", source, addonPath]);
  assert.equal(result.stderr, "", "contained panics must not expose Rust panic details");
}

async function assembleNativePackage(directory, targetDirectory) {
  await mkdir(directory, { recursive: true });
  await copyFile(nativeLibrary(targetDirectory, "release"), join(directory, target.addonFile));
  await copyFile(probeBinary(targetDirectory), join(directory, target.cliFile));
  await chmod(join(directory, target.cliFile), 0o755);
  await writeFile(join(directory, "package.json"), `${JSON.stringify({
    name: target.packageName,
    version: packageJson.version,
    private: true,
    main: target.addonFile,
    files: [target.addonFile, target.cliFile],
    os: [target.npmPlatform],
    cpu: [target.npmArch],
    ...(target.libc ? { libc: [target.libc] } : {}),
    engines: { node: `>=${manifest.minimumNodeVersion}` }
  }, null, 2)}\n`);
}

async function assembleLauncherPackage(directory) {
  await mkdir(directory, { recursive: true });
  await mkdir(join(directory, "dist"));
  for (const file of await readdir(join(packageRoot, "dist"))) {
    await copyFile(join(packageRoot, "dist", file), join(directory, "dist", file));
  }
  await copyFile(join(packageRoot, "README.md"), join(directory, "README.md"));
  await copyFile(join(packageRoot, "LICENSE.md"), join(directory, "LICENSE.md"));
  await copyFile(
    join(packageRoot, "THIRD_PARTY_LICENSES.md"),
    join(directory, "THIRD_PARTY_LICENSES.md")
  );
  const optionalDependencies = Object.fromEntries(
    manifest.targets.map((candidate) => [candidate.packageName, packageJson.version])
  );
  const packedPackageJson = {
    ...packageJson,
    optionalDependencies
  };
  assertTargetAlignment(manifest, packedPackageJson);
  await writeFile(join(directory, "package.json"), `${JSON.stringify(packedPackageJson, null, 2)}\n`);
}

function pack(directory, destination) {
  const result = run(npmCommand, ["pack", directory, "--ignore-scripts", "--json", "--pack-destination", destination]);
  const [entry] = JSON.parse(result.stdout);
  assert(entry?.filename, `npm pack did not report a tarball for ${directory}`);
  return { ...entry, tarball: join(destination, entry.filename) };
}

function assertPackContents(nativePack, rootPack) {
  const nativeFiles = new Set(nativePack.files.map((file) => file.path));
  assert(nativeFiles.has(target.addonFile), "native package must contain the addon");
  assert(nativeFiles.has(target.cliFile), "native package must contain the Rust CLI probe");

  const rootFiles = new Set(rootPack.files.map((file) => file.path));
  assert(rootFiles.has("dist/native-targets.json"), "launcher package must contain the target authority");
  assert(rootFiles.has("dist/runtime-target.js"), "launcher package must contain shared target selection");
  assert(rootFiles.has("THIRD_PARTY_LICENSES.md"), "launcher package must contain bundled Node notices");
  assert([...rootFiles].every((file) => !file.endsWith(".node")), "launcher package must not contain an addon");
  assert(!rootFiles.has(target.cliFile), "launcher package must not contain the Rust binary");
}

async function installConsumer(directory, rootTarball, nativeTarball, includeNative) {
  await mkdir(directory, { recursive: true });
  const dependencies = { [packageJson.name]: `file:${rootTarball}` };
  if (includeNative) dependencies[target.packageName] = `file:${nativeTarball}`;
  await writeFile(join(directory, "package.json"), `${JSON.stringify({
    private: true,
    type: "module",
    dependencies
  }, null, 2)}\n`);
  run(npmCommand, [
    "install",
    "--ignore-scripts",
    "--offline",
    "--no-audit",
    "--no-fund",
    "--package-lock=false"
  ], { cwd: directory, env: { ...process.env, npm_config_cache: join(scratch, "npm-cache") } });
}

async function testPackedAddon(consumer) {
  const source = String.raw`
    import assert from "node:assert/strict";
    import { getParagraph } from ${JSON.stringify(packageJson.name)};
    await assert.rejects(
      getParagraph({}),
      (error) => error.name === "KasbFailure" &&
        error.code === "invalid_input" &&
        error.parameter === "paraNum"
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      getParagraph({stdNum:"1116", paraNum:"23"}, {signal: controller.signal}),
      (error) => error.name === "KasbToolsetError" &&
        error.code === "aborted" &&
        error.recoverable === false &&
        error.retryable === true &&
        error.operationName === "get-paragraph"
    );
  `;
  run(process.execPath, ["--input-type=module", "-e", source], { cwd: consumer });
}

async function testLauncherContract(consumer, targetDirectory) {
  const direct = probeBinary(targetDirectory);
  const launcher = launcherPath(consumer);
  const argumentsList = ["", "plain", "space value", "따옴표'\"", "--", "$HOME", "한글"];
  const env = {
    ...process.env,
    KASB_PROBE_VALUE: "환경 값 with spaces",
    KASB_PROBE_EXIT_CODE: "37"
  };
  const options = { cwd: consumer, env, input: "표준입력\nsecond line\n", encoding: "utf8" };
  const directResult = spawnSync(direct, argumentsList, options);
  const launchedResult = spawnSync(process.execPath, [launcher, ...argumentsList], options);

  for (const field of ["status", "signal", "stdout", "stderr"]) {
    assert.deepEqual(launchedResult[field], directResult[field], `launcher must preserve ${field}`);
  }
  assert.equal(directResult.status, 37);
  const observed = JSON.parse(directResult.stdout);
  assert.deepEqual(observed.args, argumentsList);
  assert.equal(observed.cwd, await realpath(consumer));
  assert.equal(observed.environment, env.KASB_PROBE_VALUE);
  assert.equal(observed.stdin, options.input);

  const bin = join(consumer, "node_modules", ".bin", process.platform === "win32" ? "kasb.cmd" : "kasb");
  run(bin, [], { cwd: consumer });
}

async function testSignals(consumer, targetDirectory) {
  if (process.platform === "win32") return;
  const env = { ...process.env, KASB_PROBE_WAIT_SIGNAL: "1" };
  const direct = await terminateAfterReady(probeBinary(targetDirectory), [], { cwd: consumer, env });
  const launched = await terminateAfterReady(process.execPath, [launcherPath(consumer)], { cwd: consumer, env });
  assert.deepEqual(launched, direct, "launcher must preserve child termination signal");
  assert.equal(direct.signal, "SIGTERM");
}

function terminateAfterReady(command, args, options) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`timed out waiting for ${command}`));
    }, 10_000);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.includes("probe-ready")) child.kill("SIGTERM");
    });
    child.once("error", reject);
    child.once("close", (status, signal) => {
      clearTimeout(timeout);
      resolvePromise({ status, signal, stderr });
    });
  });
}

async function testInstallationErrors(consumer) {
  const nativeDirectory = join(consumer, "node_modules", ...target.packageName.split("/"));
  const installedCli = join(nativeDirectory, target.cliFile);
  const hiddenCli = `${installedCli}.missing`;
  await rename(installedCli, hiddenCli);
  const missingArtifact = spawnSync(process.execPath, [launcherPath(consumer)], { encoding: "utf8" });
  assert.equal(missingArtifact.status, 1);
  assert.equal(missingArtifact.stdout, "");
  assert.match(missingArtifact.stderr, /missing_native_artifact/);
  await rename(hiddenCli, installedCli);

  if (process.platform !== "win32") {
    await chmod(installedCli, 0o644);
    const notExecutable = spawnSync(process.execPath, [launcherPath(consumer)], { encoding: "utf8" });
    assert.equal(notExecutable.status, 1);
    assert.equal(notExecutable.stdout, "");
    assert.match(notExecutable.stderr, /native_cli_not_executable/);
    await chmod(installedCli, 0o755);
  }

  const nativePackageJson = join(nativeDirectory, "package.json");
  const original = await readFile(nativePackageJson, "utf8");
  const skewed = JSON.parse(original);
  skewed.version = "9.9.9";
  await writeFile(nativePackageJson, `${JSON.stringify(skewed, null, 2)}\n`);
  const mismatch = spawnSync(process.execPath, [launcherPath(consumer)], { encoding: "utf8" });
  assert.equal(mismatch.status, 1);
  assert.equal(mismatch.stdout, "");
  assert.match(mismatch.stderr, /native_version_mismatch/);
  assert.doesNotMatch(mismatch.stderr, /9\.9\.9/);
  await writeFile(nativePackageJson, original);

  for (const invalidMetadata of [
    "{ invalid package metadata\n",
    "null\n",
    "{}\n",
    `${JSON.stringify({ name: "wrong-package", version: packageJson.version })}\n`,
    `${JSON.stringify({ name: target.packageName, version: { private: "detail" } })}\n`,
  ]) {
    await writeFile(nativePackageJson, invalidMetadata);
    const malformed = spawnSync(process.execPath, [launcherPath(consumer)], { encoding: "utf8" });
    assert.equal(malformed.status, 1);
    assert.equal(malformed.stdout, "");
    assert.match(malformed.stderr, /invalid_native_package/);
    assert.doesNotMatch(malformed.stderr, /SyntaxError|JSON|package\.json|private|detail|wrong-package/);
  }

  const untrustedVersion = { ...JSON.parse(original), version: "\u001b[31mprivate-version" };
  await writeFile(nativePackageJson, `${JSON.stringify(untrustedVersion)}\n`);
  const untrustedMismatch = spawnSync(process.execPath, [launcherPath(consumer)], { encoding: "utf8" });
  assert.equal(untrustedMismatch.status, 1);
  assert.equal(untrustedMismatch.stdout, "");
  assert.match(untrustedMismatch.stderr, /native_version_mismatch/);
  assert.doesNotMatch(untrustedMismatch.stderr, /private-version|\u001b/);
  await writeFile(nativePackageJson, original);
}

function testMissingPackage(consumer) {
  const result = spawnSync(process.execPath, [launcherPath(consumer)], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /missing_native_package/);
}

function launcherPath(consumer) {
  return join(consumer, "node_modules", ...packageJson.name.split("/"), "dist", "cli.js");
}

function run(command, args, options = {}) {
  const invocation = commandInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: options.cwd ?? repositoryRoot,
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...invocation.options
  });
  if (result.error) throw result.error;
  const failed = result.status !== 0;
  if (failed !== (options.expectFailure === true)) {
    throw new Error([
      `${command} ${args.join(" ")} ${failed ? "failed" : "unexpectedly succeeded"}`,
      result.stdout,
      result.stderr
    ].filter(Boolean).join("\n"));
  }
  return result;
}

function commandInvocation(command, args) {
  if (process.platform !== "win32" || !/\.(?:cmd|bat)$/i.test(command)) {
    return { command, args };
  }
  const commandLine = [command, ...args].map(quoteCmdArgument).join(" ");
  return {
    command: process.env.ComSpec || "cmd.exe",
    args: ["/d", "/s", "/c", `"${commandLine}"`],
    options: { windowsVerbatimArguments: true }
  };
}

async function resolveWindowsCommand(command) {
  for (const directory of (process.env.PATH || "").split(delimiter)) {
    if (!directory) continue;
    const candidate = resolve(directory, command);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Keep searching PATH.
    }
  }
  throw new Error(`Could not resolve ${command} from PATH.`);
}

function quoteCmdArgument(value) {
  const text = String(value);
  if (/[\0\r\n"]/u.test(text)) {
    throw new Error("Windows command arguments must not contain NUL, line breaks, or quotes.");
  }
  return `"${text.replaceAll("%", "%%")}"`;
}
