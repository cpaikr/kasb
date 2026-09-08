import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

import { executeGitHubPublication } from "./release-publication.mjs";
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
  const output = resolve(repositoryRoot, options.output ?? "dist/release/github-publication-receipt.json");
  let receipt = { schemaVersion: 1, ok: false, channel: "github", operations: [], error: { code: "not_started", message: "publication executor did not start" } };
  try {
    const candidate = JSON.parse(await readFile(resolve(repositoryRoot, options.candidate ?? "dist/release/candidate.json"), "utf8"));
    receipt = await executeGitHubPublication(candidate, githubAdapter(candidate));
  } catch (error) {
    receipt = error?.receipt ?? { ...receipt, error: { code: error?.code ?? "operation_failed", message: error instanceof Error ? error.message : String(error) } };
    process.exitCode = 1;
  } finally {
    await writeReceiptAtomically(output, receipt);
    console.log(JSON.stringify(receipt));
  }
}

async function writeReceiptAtomically(output, receipt) {
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
}

function githubAdapter(candidate, runCommand = command) {
  const stateCommandLimits = {
    maxOutputBytes: contract.release.metadataLimitBytes,
    timeoutMs: (
      (candidate.githubAssets?.length ?? contract.targets.length + 4) * contract.release.archiveRequestTimeoutSeconds
      + 10 * contract.release.requestTimeoutSeconds
    ) * 1000,
  };
  return {
    async readCandidateFile(path) { return readFile(resolve(repositoryRoot, path)); },
    async readState() {
      const directory = await mkdtemp(join(tmpdir(), "kasb-github-state-"));
      const outputPath = join(directory, "state.json");
      try {
        await runCommand(process.execPath, [
          resolve(repositoryRoot, "scripts/capture-release-publication-state.mjs"),
          "--commit", candidate.commit,
          "--output", outputPath,
        ], stateCommandLimits);
        return JSON.parse(await readFile(outputPath, "utf8")).github;
      } finally { await rm(directory, { recursive: true, force: true }); }
    },
    async createDraft({ tag, targetSha }) {
      await runCommand("gh", ["release", "create", tag, "--repo", candidate.repository, "--verify-tag", "--target", targetSha, "--draft", "--title", tag, "--generate-notes"]);
    },
    async uploadAsset({ name, bytes }) {
      await withPrivateCandidateFile(bytes, name, (path) => runCommand(
        "gh",
        ["release", "upload", candidate.canonicalTag, path, "--repo", candidate.repository],
        metadataCommandLimits,
      ));
    },
    async publishDraft({ tag }) {
      await runCommand("gh", ["release", "edit", tag, "--repo", candidate.repository, "--draft=false", "--latest"]);
    },
  };
}

function command(executable, args, {
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
      else reject(new Error(`${executable} failed (${status}): ${stderr.trim()}`));
    });
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
  const receiptDirectory = await mkdtemp(join(tmpdir(), "kasb-receipt-test-"));
  const receiptPath = join(receiptDirectory, "receipt.json");
  try {
    await writeFile(receiptPath, '{"error":{"code":"outcome_unknown"}}\n');
    await writeReceiptAtomically(receiptPath, { schemaVersion: 1, ok: true, channel: "github", operations: [] });
    assert.deepEqual(JSON.parse(await readFile(receiptPath, "utf8")), { schemaVersion: 1, ok: true, channel: "github", operations: [] });
  } finally {
    await rm(receiptDirectory, { recursive: true, force: true });
  }
  const expected = Buffer.from("verified candidate bytes\n");
  let observedPath;
  await withPrivateCandidateFile(expected, "candidate.tgz", async (path) => {
    observedPath = path;
    assert.deepEqual(await readFile(path), expected);
    assert.equal(path.startsWith(tmpdir()), true);
  });
  await assert.rejects(readFile(observedPath), /ENOENT/u);
  await assert.rejects(
    command(process.execPath, ["-e", "process.stdout.write('12345')"], { maxOutputBytes: 4, timeoutMs: 1000 }),
    /output exceeds its bound/u,
  );

  const liveCandidate = {
    repository: "cpaikr/kasb",
    canonicalTag: "v0.3.0",
    commit: "a".repeat(40),
  };
  const githubCalls = [];
  let uploadedPath;
  const github = githubAdapter(liveCandidate, async (executable, args, options) => {
    githubCalls.push({ executable, args });
    if (executable === process.execPath) {
      assert.equal(options.env, undefined);
      assert(options.timeoutMs > contract.release.archiveRequestTimeoutSeconds * 1000);
      const outputPath = args[args.indexOf("--output") + 1];
      await writeFile(outputPath, `${JSON.stringify({ github: { state: "vacant" } })}\n`);
    } else if (args[1] === "upload") {
      uploadedPath = args[3];
      assert.equal(basename(uploadedPath), "install.sh");
      assert.deepEqual(await readFile(uploadedPath), expected);
    }
    return { stdout: "", stderr: "", notFound: false };
  });
  assert.deepEqual(await github.readState(), { state: "vacant" });
  await github.createDraft({ tag: liveCandidate.canonicalTag, targetSha: liveCandidate.commit });
  await github.uploadAsset({ name: "install.sh", bytes: expected });
  await assert.rejects(readFile(uploadedPath), /ENOENT/u);
  await github.publishDraft({ tag: liveCandidate.canonicalTag });
  assert.deepEqual(githubCalls.slice(1).map(({ executable, args }) => [executable, args]), [
    ["gh", ["release", "create", "v0.3.0", "--repo", "cpaikr/kasb", "--verify-tag", "--target", liveCandidate.commit, "--draft", "--title", "v0.3.0", "--generate-notes"]],
    ["gh", ["release", "upload", "v0.3.0", uploadedPath, "--repo", "cpaikr/kasb"]],
    ["gh", ["release", "edit", "v0.3.0", "--repo", "cpaikr/kasb", "--draft=false", "--latest"]],
  ]);

  console.log("publication executor uses bounded commands, private verified-byte files, and exact live adapter commands");
}

function parse(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]; const value = args[index + 1];
    if (!["--candidate", "--output"].includes(flag) || value === undefined) throw new Error("invalid publication executor options");
    result[flag.slice(2)] = value;
  }
  return result;
}
