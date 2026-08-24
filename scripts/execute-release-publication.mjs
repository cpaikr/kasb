import assert from "node:assert/strict";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

import { executeGitHubPublication, executeNpmPublication } from "./release-publication.mjs";
import { loadReleaseContract, repositoryRoot } from "./release-contract.mjs";

const contract = await loadReleaseContract();
const metadataCommandLimits = {
  maxOutputBytes: contract.release.metadataLimitBytes,
  timeoutMs: contract.release.requestTimeoutSeconds * 1000,
};

if (process.argv[2] === "--self-test") await selfTest();
else await main();

async function main() {
  const options = parse(process.argv.slice(2));
  const output = resolve(repositoryRoot, options.output ?? `dist/release/${options.channel}-publication-receipt.json`);
  let receipt = { schemaVersion: 1, ok: false, channel: options.channel, operations: [], error: { code: "not_started", message: "publication executor did not start" } };
  try {
    const candidate = JSON.parse(await readFile(resolve(repositoryRoot, options.candidate ?? "dist/release/candidate.json"), "utf8"));
    if (options.channel === "github") {
      receipt = await executeGitHubPublication(candidate, githubAdapter(candidate, options));
    } else {
      const githubReceipt = JSON.parse(await readFile(resolve(repositoryRoot, required(options["github-receipt"], "--github-receipt is required for npm")), "utf8"));
      receipt = await executeNpmPublication(candidate, githubReceipt, npmAdapter());
    }
  } catch (error) {
    receipt = error?.receipt ?? { ...receipt, error: { code: error?.code ?? "operation_failed", message: error instanceof Error ? error.message : String(error) } };
    process.exitCode = 1;
  } finally {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(JSON.stringify(receipt));
  }
}

function githubAdapter(candidate, options) {
  const policyToken = required(process.env.KASB_RELEASE_POLICY_TOKEN, "KASB_RELEASE_POLICY_TOKEN is required for live release-policy checks");
  return {
    async readCandidateFile(path) { return readFile(resolve(repositoryRoot, path)); },
    async readState() {
      const directory = await mkdtemp(join(tmpdir(), "kasb-github-state-"));
      const outputPath = join(directory, "state.json");
      try {
        await command(process.execPath, [
          resolve(repositoryRoot, "scripts/capture-release-publication-state.mjs"),
          "--commit", candidate.commit,
          "--output", outputPath,
          "--github-only", "true",
        ], { ...metadataCommandLimits, env: { ...process.env, GH_TOKEN: policyToken } });
        return JSON.parse(await readFile(outputPath, "utf8")).github;
      } finally { await rm(directory, { recursive: true, force: true }); }
    },
    async createDraft({ tag, targetSha }) {
      await command("gh", ["release", "create", tag, "--repo", candidate.repository, "--verify-tag", "--target", targetSha, "--draft", "--title", tag, "--generate-notes"]);
    },
    async uploadAsset({ name, bytes }) {
      await withPrivateCandidateFile(bytes, name, (path) => command(
        "gh",
        ["release", "upload", candidate.canonicalTag, path, "--repo", candidate.repository],
        metadataCommandLimits,
      ));
    },
    async publishDraft({ tag }) {
      await command("gh", ["release", "edit", tag, "--repo", candidate.repository, "--draft=false", "--latest"]);
    },
  };
}

function npmAdapter(runCommand = command) {
  return {
    async readCandidateFile(path) { return readFile(resolve(repositoryRoot, path)); },
    async inspectPackage({ name, version, maxBytes }) {
      const viewed = await runCommand("npm", ["view", `${name}@${version}`, "dist.tarball", "--json"], { ...metadataCommandLimits, allowNotFound: true });
      if (viewed.notFound) return { state: "vacant" };
      const url = JSON.parse(viewed.stdout);
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.hostname !== "registry.npmjs.org" || parsed.username || parsed.password || parsed.port) {
        throw new Error(`npm returned a noncanonical tarball URL for ${name}@${version}`);
      }
      const directory = await mkdtemp(join(tmpdir(), "kasb-npm-state-"));
      const path = join(directory, "package.tgz");
      try {
        await commandToFile("curl", ["--fail", "--location", "--proto", "=https", "--tlsv1.2", url], path, {
          maxBytes,
          timeoutMs: contract.release.archiveRequestTimeoutSeconds * 1000,
          stallTimeoutMs: contract.release.transferStallTimeoutSeconds * 1000,
        });
        return { state: "published", bytes: await readFile(path) };
      } finally { await rm(directory, { recursive: true, force: true }); }
    },
    async publishPackage({ bytes }) {
      await withPrivateCandidateFile(bytes, "candidate.tgz", (path) => runCommand(
        "npm",
        ["publish", path, "--access", "public", "--provenance"],
        {
          maxOutputBytes: contract.release.metadataLimitBytes,
          timeoutMs: contract.release.archiveRequestTimeoutSeconds * 1000,
        },
      ));
    },
    isConflict(error) { return /(?:E409|cannot publish over|previously published)/iu.test(error?.message ?? ""); },
  };
}

function command(executable, args, {
  allowNotFound = false,
  env = process.env,
  maxOutputBytes = contract.release.metadataLimitBytes,
  timeoutMs = contract.release.requestTimeoutSeconds * 1000,
} = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { cwd: repositoryRoot, env });
    let stdout = "";
    let stderr = "";
    let bytes = 0;
    let settled = false;
    const timer = setTimeout(() => fail(new Error(`${executable} command timed out`)), timeoutMs);
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      reject(error);
    };
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > maxOutputBytes) fail(new Error(`${executable} output exceeds its bound`));
      else stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > maxOutputBytes) fail(new Error(`${executable} output exceeds its bound`));
      else stderr += chunk;
    });
    child.once("error", fail);
    child.once("close", (status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (status === 0) resolvePromise({ stdout, stderr, notFound: false });
      else if (allowNotFound && /(?:E404|HTTP 404|not found)/iu.test(`${stdout}\n${stderr}`)) resolvePromise({ stdout, stderr, notFound: true });
      else reject(new Error(`${executable} failed (${status}): ${stderr.trim()}`));
    });
  });
}

function commandToFile(executable, args, path, { maxBytes, timeoutMs, stallTimeoutMs }) {
  return new Promise((resolvePromise, reject) => {
    const output = createWriteStream(path, { flags: "wx", mode: 0o600 });
    const child = spawn(executable, args, { cwd: repositoryRoot, env: process.env });
    let bytes = 0;
    let stderr = "";
    let settled = false;
    let childStatus;
    let outputClosed = false;
    const deadline = setTimeout(() => fail(new Error(`${executable} download timed out`)), timeoutMs);
    let stall = setTimeout(() => fail(new Error(`${executable} download stalled`)), stallTimeoutMs);
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearTimeout(stall);
      child.kill("SIGKILL");
      output.destroy();
      reject(error);
    };
    const finish = () => {
      if (settled || childStatus === undefined || !outputClosed) return;
      settled = true;
      clearTimeout(deadline);
      clearTimeout(stall);
      if (childStatus === 0) resolvePromise();
      else reject(new Error(`${executable} download failed (${childStatus}): ${stderr.trim()}`));
    };
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (Buffer.byteLength(stderr) > contract.release.metadataLimitBytes) fail(new Error(`${executable} download diagnostics exceed their bound`));
    });
    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) return fail(new Error("registry tarball exceeds its candidate bound"));
      clearTimeout(stall);
      stall = setTimeout(() => fail(new Error(`${executable} download stalled`)), stallTimeoutMs);
      if (!output.write(chunk)) child.stdout.pause();
    });
    output.on("drain", () => child.stdout.resume());
    child.stdout.once("end", () => output.end());
    output.once("error", fail); child.once("error", fail);
    child.once("close", (value) => { childStatus = value; finish(); });
    output.once("close", () => { outputClosed = true; finish(); });
  });
}

async function withPrivateCandidateFile(bytes, name, operation) {
  if (basename(name) !== name) throw new Error("verified candidate filename must be a basename");
  const directory = await mkdtemp(join(tmpdir(), "kasb-verified-candidate-"));
  const path = join(directory, name);
  try {
    await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
    return await operation(path);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

async function selfTest() {
  const expected = Buffer.from("verified candidate bytes\n");
  let observedPath;
  await withPrivateCandidateFile(expected, "candidate.tgz", async (path) => {
    observedPath = path;
    assert.deepEqual(await readFile(path), expected);
    assert.equal(path.startsWith(tmpdir()), true);
  });
  await assert.rejects(readFile(observedPath), /ENOENT/u);
  let publishedPath;
  const adapter = npmAdapter(async (executable, args) => {
    assert.equal(executable, "npm");
    publishedPath = args[1];
    assert.deepEqual(await readFile(publishedPath), expected);
    return { stdout: "", stderr: "", notFound: false };
  });
  await adapter.publishPackage({ bytes: expected });
  await assert.rejects(readFile(publishedPath), /ENOENT/u);
  await assert.rejects(
    command(process.execPath, ["-e", "process.stdout.write('12345')"], { maxOutputBytes: 4, timeoutMs: 1000 }),
    /output exceeds its bound/u,
  );
  console.log("publication executor uses bounded commands and private verified-byte files");
}

function parse(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]; const value = args[index + 1];
    if (!["--channel", "--candidate", "--github-receipt", "--output"].includes(flag) || value === undefined) throw new Error("invalid publication executor options");
    result[flag.slice(2)] = value;
  }
  if (!["github", "npm"].includes(result.channel)) throw new Error("--channel must be github or npm");
  return result;
}

function required(value, message) { if (!value) throw new Error(message); return value; }
