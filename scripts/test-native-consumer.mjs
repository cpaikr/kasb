import assert from "node:assert/strict";
import { execFileSync, spawn as spawnChild, spawnSync } from "node:child_process";
import { access, chmod, constants, copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { localTarDestination, localTarInvocation } from "./local-archive-path.mjs";
import { loadReleaseContract, repositoryRoot } from "./release-contract.mjs";

const rustTarget = process.argv[2];
if (!rustTarget) {
  throw new Error("Usage: node scripts/test-native-consumer.mjs <rust-target> [root-tarball-or-directory] [native-tarball-or-directory] [direct-cli-archive-or-directory]");
}

const contract = await loadReleaseContract();
const { manifest } = contract;
const target = contract.targets.find((candidate) => candidate.rustTarget === rustTarget);
if (!target) throw new Error(`Unknown native target: ${rustTarget}`);
if (process.platform !== target.npmPlatform || process.arch !== target.npmArch) {
  throw new Error(`Consumer runner is ${process.platform}-${process.arch}, expected ${target.npmPlatform}-${target.npmArch}.`);
}

const npm = process.platform === "win32" ? await resolveWindowsCommand("npm.cmd") : "npm";
const rootDirectory = resolve(repositoryRoot, manifest.rootPackage);
const nativeDirectory = resolve(repositoryRoot, manifest.nativePackageRoot, target.packageDirectory);
const rootPackage = JSON.parse(await readFile(resolve(rootDirectory, "package.json"), "utf8"));
const temporary = await mkdtemp(resolve(tmpdir(), "kasb-native-consumer-"));

try {
  const rootTarball = await suppliedTarball(process.argv[3]) ?? pack(rootDirectory);
  const nativeTarball = await suppliedTarball(process.argv[4]) ?? pack(nativeDirectory);
  inspectPack(rootTarball, false);
  inspectPack(nativeTarball, true);

  await writeFile(resolve(temporary, "package.json"), `${JSON.stringify({
    private: true,
    type: "module",
    dependencies: {
      [rootPackage.name]: `file:${rootTarball}`,
      [target.packageName]: `file:${nativeTarball}`,
    },
  }, null, 2)}\n`);
  run(npm, ["install", "--ignore-scripts", "--offline", "--no-audit", "--no-fund", "--package-lock=false"], temporary);

  const installedNative = resolve(temporary, "node_modules", ...target.packageName.split("/"));
  const installedRoot = resolve(temporary, "node_modules", ...rootPackage.name.split("/"));
  const installedCli = resolve(installedNative, target.cliFile);
  if (process.platform !== "win32") await access(installedCli, constants.X_OK);
  const directCli = await extractDirectCliArchive(process.argv[5], temporary) ?? installedCli;

  const sdkInspection = run(process.execPath, [
    "--input-type=module",
    "-e",
    consumerSource(rootPackage.name),
  ], temporary);
  assert.deepEqual(JSON.parse(sdkInspection.stdout), {
    operations: ["search-standards", "get-standard-structure", "get-section", "get-paragraph", "search-qna", "get-qna"],
    invalidCodes: ["invalid_input", "invalid_input", "invalid_input", "invalid_input", "invalid_input", "invalid_input"],
    toolsetInvalid: "invalid_input",
    toolsetNativeFailure: { code: "invalid_input", sdkClass: true },
    cancelled: "aborted",
  });

  const launcher = resolve(
    temporary,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "kasb.cmd" : "kasb",
  );
  await verifyResolverMetadataFailures(installedRoot, launcher, temporary);
  for (const args of [["--version"], ["--help"], ["get-paragraph", "--std-num", "1116"]]) {
    const direct = spawn(directCli, args, temporary);
    const launched = spawn(launcher, args, temporary);
    for (const field of ["status", "signal", "stdout", "stderr"]) {
      assert.deepEqual(launched[field], direct[field], `npm launcher must preserve ${field} for ${args.join(" ")}`);
    }
    if (args[0] === "--version") {
      assert.equal(direct.status, 0, "direct CLI version identity must succeed");
      assert.equal(direct.stdout.trim(), `kasb ${contract.version}`, "direct CLI version must match Cargo identity");
    }
  }
  await verifyLauncherProcessContract(installedRoot, installedCli, directCli, launcher, temporary);

  console.log(`clean packed consumer passed ${rustTarget} on Node ${process.versions.node}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}

async function verifyLauncherProcessContract(installedRoot, installedCli, directCli, launcher, cwd) {
  const metadata = JSON.parse(exec("cargo", ["metadata", "--no-deps", "--format-version", "1"], { encoding: "utf8" }));
  const probe = resolve(
    metadata.target_directory,
    rustTarget,
    "release",
    process.platform === "win32" ? "kasb-process-probe.exe" : "kasb-process-probe",
  );
  const env = {
    ...process.env,
    KASB_PROBE_VALUE: "환경 값 with spaces",
    KASB_PROBE_EXIT_CODE: "37",
  };
  const signalEnv = { ...process.env, KASB_PROBE_WAIT_SIGNAL: "1" };
  await copyFile(probe, installedCli);
  if (directCli !== installedCli) await copyFile(probe, directCli);
  if (process.platform === "win32") {
    const directTermination = await terminateWindowsProcess(
      directCli,
      [],
      (child) => child.kill("SIGTERM"),
      { cwd, env: signalEnv },
    );
    // npm's generated .cmd shim requires a shell, and closing that shell does
    // not prove its descendants exited. Ordinary invocation still exercises
    // the shim above. This wrapper runs the installed launcher in real Node
    // and triggers its registered SIGBREAK handler after the native child is
    // ready, without assuming that a headless CI runner owns a Windows console.
    const launcherProbe = resolve(cwd, "windows-launcher-probe.mjs");
    await writeFile(launcherProbe, `
      process.stdin.once("data", () => process.emit("SIGBREAK"));
      await import(${JSON.stringify(pathToFileURL(resolve(installedRoot, "dist", "cli.js")).href)});
    `);
    const launcherTermination = await terminateWindowsProcess(
      process.execPath,
      [launcherProbe],
      (child) => child.stdin.end("terminate\n"),
      { cwd, env: signalEnv },
    );
    for (const [name, termination] of [
      ["direct CLI", directTermination],
      ["npm launcher", launcherTermination],
    ]) {
      assert.ok(
        termination.status !== 0 || termination.signal !== null,
        `${name} must terminate unsuccessfully under the Windows termination contract`,
      );
      assert.equal(termination.stdout, "", `${name} must not invent stdout during termination`);
      assert.equal(
        termination.stderr.replaceAll("\r\n", "\n"),
        "probe-ready\n",
        `${name} must preserve inherited stderr during termination`,
      );
    }
  } else {
    await chmod(installedCli, 0o755);
    if (directCli !== installedCli) await chmod(directCli, 0o755);
  }

  const args = ["", "plain", "space value", "따옴표'", "--", "$HOME", "한글"];
  const input = "표준입력\nsecond line\n";
  const options = { cwd, env, input, encoding: "utf8" };
  const direct = spawn(directCli, args, cwd, options);
  const launched = spawn(launcher, args, cwd, options);
  for (const field of ["status", "signal", "stdout", "stderr"]) {
    assert.deepEqual(launched[field], direct[field], `npm launcher must preserve probe ${field}`);
  }
  assert.equal(direct.status, 37);
  const observed = JSON.parse(direct.stdout);
  assert.deepEqual(observed.args, args);
  assert.equal(await realpath(observed.cwd), await realpath(cwd));
  assert.equal(observed.environment, env.KASB_PROBE_VALUE);
  assert.equal(observed.stdin, input);

  if (process.platform !== "win32") {
    const directSignal = await terminateAfterReady(directCli, [], { cwd, env: signalEnv });
    const launcherSignal = await terminateAfterReady(launcher, [], { cwd, env: signalEnv });
    assert.deepEqual(launcherSignal, directSignal, "npm launcher must preserve POSIX child termination");
    assert.equal(directSignal.signal, "SIGTERM");
  }
}

async function verifyResolverMetadataFailures(installedRoot, launcher, cwd) {
  const manifestPath = resolve(installedRoot, "dist", "native-targets.json");
  const original = await readFile(manifestPath, "utf8");
  const expected = "kasb: invalid_native_manifest: The installed KASB package has invalid native target metadata. Reinstall the KASB package.\n";
  const corruptions = [
    async () => rm(manifestPath),
    async () => writeFile(manifestPath, "{not-json\n"),
    async () => writeFile(manifestPath, '{"targets":[]}\n'),
  ];
  try {
    for (const corrupt of corruptions) {
      await corrupt();
      const result = spawn(launcher, ["--help"], cwd);
      assert.equal(result.status, 1);
      assert.equal(result.signal, null);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, expected);
      await writeFile(manifestPath, original);
    }
  } finally {
    await writeFile(manifestPath, original);
  }
}

async function extractDirectCliArchive(input, destinationRoot) {
  if (!input) return undefined;
  const archive = await suppliedArchive(input);
  const destination = resolve(destinationRoot, "direct-cli");
  await mkdir(destination, { recursive: true });
  const invocation = localTarInvocation(archive, "-xzf", ["-C", localTarDestination(archive, destination)]);
  run("tar", invocation.args, invocation.options.cwd);
  const cli = resolve(destination, target.cliFile);
  const metadata = await stat(cli);
  if (!metadata.isFile()) throw new Error(`Direct CLI archive is missing ${target.cliFile}.`);
  if (process.platform !== "win32") await access(cli, constants.X_OK);
  return cli;
}

function terminateAfterReady(command, args, options) {
  return new Promise((resolvePromise, reject) => {
    const invocation = commandInvocation(command, args);
    const child = spawnChild(invocation.command, invocation.args, {
      ...options,
      ...invocation.options,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let terminationRequested = false;
    let settled = false;
    let timeout;
    const rejectWithCleanup = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      killProbeGroup(child);
      reject(error);
    };
    timeout = setTimeout(() => {
      const phase = terminationRequested ? "process termination" : "process readiness";
      rejectWithCleanup(new Error(`Timed out waiting for ${phase}: ${command}`));
    }, 10_000);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (!terminationRequested && stderr.includes("probe-ready")) {
        terminationRequested = true;
        child.kill("SIGTERM");
      }
    });
    child.once("error", rejectWithCleanup);
    child.once("close", (status, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolvePromise({ status, signal, stderr });
    });
  });
}

function killProbeGroup(child) {
  if (child.pid !== undefined) {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
      // Fall back when spawn failed before the dedicated group existed.
    }
  }
  try {
    child.kill("SIGKILL");
  } catch {
    // Cleanup is best-effort after the primary probe failure.
  }
}

function terminateWindowsProcess(command, args, terminate, options) {
  return new Promise((resolvePromise, reject) => {
    const invocation = commandInvocation(command, args);
    const child = spawnChild(invocation.command, invocation.args, {
      ...options,
      ...invocation.options,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let sent = false;
    let settled = false;
    let timeout;
    const rejectWithCleanup = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (child.pid !== undefined) {
        spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
      }
      reject(error);
    };
    timeout = setTimeout(() => {
      rejectWithCleanup(new Error(`Timed out waiting for Windows process termination: ${command}`));
    }, 10_000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (!sent && stderr.includes("probe-ready")) {
        sent = true;
        try {
          terminate(child);
        } catch (error) {
          rejectWithCleanup(error);
        }
      }
    });
    child.once("error", rejectWithCleanup);
    child.once("close", (status, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolvePromise({ status, signal, stdout, stderr });
    });
  });
}

async function suppliedTarball(input) {
  if (!input) return undefined;
  const path = resolve(repositoryRoot, input);
  const metadata = await stat(path);
  if (metadata.isFile()) {
    if (!path.endsWith(".tgz")) throw new Error(`Expected a .tgz artifact: ${path}`);
    return path;
  }
  if (!metadata.isDirectory()) throw new Error(`Artifact input is neither a file nor directory: ${path}`);
  const candidates = (await readdir(path, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tgz"))
    .map((entry) => resolve(path, entry.name));
  if (candidates.length !== 1) {
    throw new Error(`Expected exactly one .tgz artifact in ${path}, found ${candidates.length}.`);
  }
  return candidates[0];
}

async function suppliedArchive(input) {
  const path = resolve(repositoryRoot, input);
  const expectedName = target.archiveName;
  const metadata = await stat(path);
  if (metadata.isFile()) {
    if (path.split(/[\\/]/u).at(-1) !== expectedName) {
      throw new Error(`Expected direct CLI archive ${expectedName}: ${path}`);
    }
    return path;
  }
  if (!metadata.isDirectory()) throw new Error(`Direct CLI input is neither a file nor directory: ${path}`);
  const candidates = (await readdir(path, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name === expectedName)
    .map((entry) => resolve(path, entry.name));
  if (candidates.length !== 1) {
    throw new Error(`Expected exactly one ${expectedName} artifact in ${path}, found ${candidates.length}.`);
  }
  return candidates[0];
}

function consumerSource(packageName) {
  return `
    import * as sdk from ${JSON.stringify(packageName)};
    import { KasbToolsetError, createKasbToolset } from ${JSON.stringify(`${packageName}/toolset`)};
    const toolset = createKasbToolset();
    const calls = [
      [sdk.searchStandards, {}],
      [sdk.getStandardStructure, {}],
      [sdk.getSection, {}],
      [sdk.getParagraph, {}],
      [sdk.searchQna, {}],
      [sdk.getQna, {}],
    ];
    const invalidCodes = [];
    for (const [call, input] of calls) {
      try { await call(input); } catch (error) { invalidCodes.push(error.code); }
    }
    const controller = new AbortController();
    controller.abort();
    let cancelled;
    try { await sdk.getParagraph({stdNum:"1116",paraNum:"23"}, {signal:controller.signal}); }
    catch (error) { cancelled = error instanceof KasbToolsetError ? error.code : "wrong_class"; }
    let toolsetInvalid;
    try { await toolset.execute("get-paragraph", {}); }
    catch (error) { toolsetInvalid = error.code; }
    let toolsetNativeFailure;
    try { await toolset.execute("get-paragraph", {stdNum:"..",paraNum:"23"}); }
    catch (error) {
      toolsetNativeFailure = {
        code: error.code,
        sdkClass: error instanceof sdk.KasbFailure,
      };
    }
    console.log(JSON.stringify({
      operations: toolset.listOperations().map(({name}) => name),
      invalidCodes,
      toolsetInvalid,
      toolsetNativeFailure,
      cancelled,
    }));
  `;
}

function pack(directory) {
  const [result] = JSON.parse(exec(npm, ["pack", "--ignore-scripts", "--json", "--pack-destination", temporary, directory], { encoding: "utf8" }));
  if (!result?.filename) throw new Error(`npm pack did not report an artifact for ${directory}.`);
  return resolve(temporary, result.filename);
}

function inspectPack(tarball, native) {
  const invocation = localTarInvocation(tarball, "-tzf");
  const entries = exec("tar", invocation.args, { ...invocation.options, encoding: "utf8" })
    .split(/\r?\n/u)
    .filter(Boolean);
  assert(entries.every((entry) => entry.startsWith("package/")), "npm artifact entries must stay under package/");
  const files = entries
    .filter((entry) => !entry.endsWith("/"))
    .map((entry) => entry.slice("package/".length))
    .sort();
  if (native) {
    assert.deepEqual(files, [
      "LICENSE.md",
      "README.md",
      "THIRD_PARTY_LICENSES.html",
      target.addonFile,
      target.cliFile,
      "package.json",
    ].sort());
  } else {
    assert.deepEqual(files, [
      "LICENSE.md",
      "README.md",
      "THIRD_PARTY_LICENSES.md",
      "dist/cli.js",
      "dist/error.js",
      "dist/index.d.ts",
      "dist/index.js",
      "dist/native-targets.json",
      "dist/native.d.ts",
      "dist/native.js",
      "dist/runtime-target.js",
      "dist/target.js",
      "dist/toolset.d.ts",
      "dist/toolset.js",
      "package.json",
    ].sort());
  }
}

function run(command, args, cwd) {
  const result = spawn(command, args, cwd);
  if (result.error) throw result.error;
  if (result.status !== 0 && !isExpectedCliFailure(args)) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function isExpectedCliFailure(args) {
  return args[0] === "get-paragraph";
}

function spawn(command, args, cwd, options = {}) {
  const invocation = commandInvocation(command, args);
  return spawnSync(invocation.command, invocation.args, {
    cwd,
    encoding: "utf8",
    ...options,
    ...invocation.options,
  });
}

function exec(command, args, options) {
  const invocation = commandInvocation(command, args);
  return execFileSync(invocation.command, invocation.args, { ...options, ...invocation.options });
}

function commandInvocation(command, args) {
  if (process.platform !== "win32" || !/\.(?:cmd|bat)$/iu.test(command)) return { command, args };
  const commandLine = [command, ...args].map(quoteCmdArgument).join(" ");
  return {
    command: process.env.ComSpec || "cmd.exe",
    args: ["/d", "/s", "/c", `"${commandLine}"`],
    options: { windowsVerbatimArguments: true },
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
      // Continue through PATH.
    }
  }
  throw new Error(`Could not resolve ${command} from PATH.`);
}

function quoteCmdArgument(value) {
  const text = String(value);
  if (/[\0\r\n"]/u.test(text)) throw new Error("Windows command arguments contain unsupported characters.");
  return `"${text.replaceAll("%", "%%")}"`;
}
