import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

import { highestStableVersion, loadReleaseContract, releaseAssetNames, releaseTag, repositoryRoot } from "./release-contract.mjs";

if (process.argv[2] === "--self-test") await selfTest();
else await main();

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const contract = await loadReleaseContract();
  const commit = required(options.commit, "--commit is required");
  if (!/^[0-9a-f]{40}$/u.test(commit)) throw new Error("--commit must be a full lowercase Git commit ID");
  const tag = releaseTag(contract.release, contract.version);
  const output = resolve(repositoryRoot, options.output ?? "dist/release/publication-state.json");
  const temporary = await mkdtemp(join(tmpdir(), "kasb-publication-state-"));
  try {
    const github = await githubSnapshot(contract, tag, commit, temporary, options);
    const snapshot = { schemaVersion: 1, source: "live", github };
    if (options["github-only"] !== "true") snapshot.npm = await npmSnapshot(contract, temporary);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(`captured read-only publication state for ${tag}`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function githubSnapshot(contract, tag, expectedCommit, directory, options) {
  const { release } = contract;
  const { repository } = release;
  const limits = commandLimits(release);
  const repositoryResponse = await command("gh", ["api", `repos/${repository}`], limits);
  const repositoryMetadata = JSON.parse(repositoryResponse.stdout);
  if (repositoryMetadata.private !== false) throw new Error("canonical release repository must be public before strict publication");
  let immutableReleases;
  if (options["verify-immutable-release-only"] === "true") {
    immutableReleases = undefined;
  } else {
    const immutableResponse = await command("gh", ["api", `repos/${repository}/immutable-releases`], limits);
    const immutableSettings = JSON.parse(immutableResponse.stdout);
    if (immutableSettings.enabled !== true) throw new Error("canonical repository must enable immutable releases before strict publication");
    immutableReleases = true;
  }
  const tagSha = await resolveRemoteTag(repository, tag, limits);
  if (tagSha !== expectedCommit) throw new Error("remote release tag does not peel to the requested candidate commit");
  const releasePages = JSON.parse((await command("gh", ["api", `repos/${repository}/releases?per_page=100`, "--paginate", "--slurp"], limits)).stdout);
  if (!Array.isArray(releasePages) || releasePages.some((page) => !Array.isArray(page))) throw new Error("GitHub returned invalid release history");
  const releaseHistory = releasePages.flat();
  const highestPublishedVersion = highestStableVersion(releaseHistory
    .filter((entry) => entry && entry.draft === false && entry.prerelease === false)
    .map(({ tag_name: releaseTagName }) => typeof releaseTagName === "string" && releaseTagName.startsWith(release.tagPrefix)
      ? releaseTagName.slice(release.tagPrefix.length)
      : null));
  const response = await command("gh", ["api", `repos/${repository}/releases/tags/${tag}`], { ...limits, allowNotFound: true });
  if (response.notFound) {
    if (immutableReleases !== true) throw new Error("release-only immutability verification requires an existing published immutable release");
    return { schemaVersion: 1, repository, repositoryPrivate: false, immutableReleases: true, highestPublishedVersion, tag, tagSha, release: null };
  }
  const published = JSON.parse(response.stdout);
  if (immutableReleases === undefined) {
    if (published.draft === true || published.immutable !== true) {
      throw new Error("release-only immutability verification requires the exact published release to be immutable");
    }
    immutableReleases = true;
  }
  const expectedAssets = new Set(releaseAssetNames(contract));
  if ((published.assets ?? []).length > expectedAssets.size) throw new Error("GitHub Release contains more assets than the canonical candidate allows");
  const assets = [];
  let transferred = 0;
  for (const asset of published.assets ?? []) {
    if (!expectedAssets.has(asset.name)) throw new Error(`GitHub Release contains unexpected asset ${asset.name}`);
    const maxBytes = contract.targets.some(({ archiveName }) => archiveName === asset.name)
      ? release.archiveLimitBytes
      : release.metadataLimitBytes;
    if (!Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > maxBytes) {
      throw new Error(`GitHub Release asset ${asset.name} has an invalid bounded size`);
    }
    const destination = join(directory, `github-${asset.id}`);
    await commandToFile("gh", [
      "api",
      `repos/${repository}/releases/assets/${asset.id}`,
      "-H",
      "Accept: application/octet-stream",
    ], destination, { ...limits, timeoutMs: release.archiveRequestTimeoutSeconds * 1000, maxBytes });
    transferred += asset.size;
    if (transferred > expectedAssets.size * release.archiveLimitBytes) throw new Error("GitHub Release aggregate download exceeds its bound");
    assets.push({ name: asset.name, sha256: await sha256(destination) });
  }
  return {
    schemaVersion: 1,
    repository,
    repositoryPrivate: false,
    immutableReleases,
    highestPublishedVersion,
    tag,
    tagSha,
    release: {
      tag: published.tag_name,
      targetSha: tagSha,
      draft: published.draft,
      prerelease: published.prerelease,
      immutable: published.immutable === true,
      assets,
    },
  };
}

async function resolveRemoteTag(repository, tag, limits) {
  let response = JSON.parse((await command("gh", ["api", `repos/${repository}/git/ref/tags/${tag}`], limits)).stdout);
  for (let depth = 0; depth < 5; depth += 1) {
    if (response.object?.type === "commit" && /^[0-9a-f]{40}$/u.test(response.object.sha)) return response.object.sha;
    if (response.object?.type !== "tag" || !/^[0-9a-f]{40}$/u.test(response.object.sha)) break;
    response = JSON.parse((await command("gh", ["api", `repos/${repository}/git/tags/${response.object.sha}`], limits)).stdout);
  }
  throw new Error("remote release tag did not resolve to a bounded commit identity");
}

async function npmSnapshot(contract, directory) {
  const limits = commandLimits(contract.release);
  const root = JSON.parse(await readFile(resolve(repositoryRoot, contract.manifest.rootPackage, "package.json"), "utf8"));
  const identities = [
    ...contract.targets.map(({ packageName }) => packageName),
    root.name,
  ];
  const packages = [];
  const publishedVersions = [];
  for (const name of identities) {
    const identity = `${name}@${contract.version}`;
    const versionsResponse = await command("npm", ["view", name, "versions", "--json"], { ...limits, allowNotFound: true });
    const versions = versionsResponse.notFound ? [] : JSON.parse(versionsResponse.stdout);
    const versionList = Array.isArray(versions) ? versions : [versions];
    if (versionList.some((version) => typeof version !== "string")) throw new Error(`npm returned invalid version history for ${name}`);
    publishedVersions.push(...versionList);
    if (!versionList.includes(contract.version)) {
      packages.push({ name, version: contract.version, state: "vacant" });
      continue;
    }
    const response = await command("npm", ["view", identity, "dist.tarball", "--json"], { ...limits, allowNotFound: true });
    if (response.notFound) {
      packages.push({ name, version: contract.version, state: "vacant" });
      continue;
    }
    const tarballUrl = JSON.parse(response.stdout);
    validateRegistryUrl(tarballUrl, identity);
    const destination = join(directory, `npm-${packages.length}.tgz`);
    await commandToFile("curl", ["--fail", "--location", "--proto", "=https", "--tlsv1.2", tarballUrl], destination, {
      ...limits,
      timeoutMs: contract.release.archiveRequestTimeoutSeconds * 1000,
      maxBytes: contract.release.archiveLimitBytes,
    });
    packages.push({ name, version: contract.version, state: "published", sha256: await sha256(destination) });
  }
  return { schemaVersion: 1, highestPublishedVersion: highestStableVersion(publishedVersions), packages };
}

function command(executable, args, { allowNotFound = false, maxOutputBytes = 1024 * 1024, timeoutMs = 15_000 } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { cwd: repositoryRoot });
    let stdout = "";
    let stderr = "";
    let bytes = 0;
    let settled = false;
    const timer = setTimeout(() => fail(new Error(`${executable} metadata request timed out`)), timeoutMs);
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      reject(error);
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { bytes += Buffer.byteLength(chunk); if (bytes > maxOutputBytes) fail(new Error(`${executable} metadata exceeds its bound`)); else stdout += chunk; });
    child.stderr.on("data", (chunk) => { bytes += Buffer.byteLength(chunk); if (bytes > maxOutputBytes) fail(new Error(`${executable} metadata exceeds its bound`)); else stderr += chunk; });
    child.once("error", fail);
    child.once("close", (status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (status === 0) return resolvePromise({ stdout, stderr, notFound: false });
      if (allowNotFound && /(?:HTTP 404|E404|not found)/iu.test(`${stdout}\n${stderr}`)) {
        return resolvePromise({ stdout, stderr, notFound: true });
      }
      reject(new Error(`${executable} ${args[0]} failed (${status}): ${stderr.trim()}`));
    });
  });
}

function commandToFile(executable, args, destination, { maxBytes, maxOutputBytes = 1024 * 1024, timeoutMs, stallTimeoutMs }) {
  return new Promise((resolvePromise, reject) => {
    const output = createWriteStream(destination, { flags: "wx", mode: 0o600 });
    const child = spawn(executable, args, { cwd: repositoryRoot, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let childStatus;
    let outputClosed = false;
    let settled = false;
    let bytes = 0;
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
      if (Buffer.byteLength(stderr) + Buffer.byteLength(chunk) > maxOutputBytes) {
        fail(new Error(`${executable} download diagnostics exceed their bound`));
      } else {
        stderr += chunk;
      }
    });
    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) return fail(new Error(`${executable} download exceeds its bound`));
      clearTimeout(stall);
      stall = setTimeout(() => fail(new Error(`${executable} download stalled`)), stallTimeoutMs);
      if (!output.write(chunk)) child.stdout.pause();
    });
    output.on("drain", () => child.stdout.resume());
    child.stdout.once("end", () => output.end());
    child.once("error", fail);
    output.once("error", fail);
    output.once("close", () => { outputClosed = true; finish(); });
    child.once("close", (status) => {
      childStatus = status;
      finish();
    });
  });
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function validateRegistryUrl(value, identity) {
  if (typeof value !== "string") throw new Error(`npm returned a noncanonical tarball URL for ${identity}`);
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "registry.npmjs.org" || url.port !== "" || url.username || url.password) {
    throw new Error(`npm returned a noncanonical tarball URL for ${identity}`);
  }
}

function commandLimits(release) {
  return {
    maxOutputBytes: release.metadataLimitBytes,
    timeoutMs: release.requestTimeoutSeconds * 1000,
    stallTimeoutMs: release.transferStallTimeoutSeconds * 1000,
  };
}

async function selfTest() {
  validateRegistryUrl("https://registry.npmjs.org/@scope/pkg/-/pkg-1.0.0.tgz", "fixture");
  for (const value of ["http://registry.npmjs.org/pkg.tgz", "https://registry.npmjs.org.evil.example/pkg.tgz", "https://user@registry.npmjs.org/pkg.tgz"]) {
    let rejected = false;
    try { validateRegistryUrl(value, "fixture"); } catch { rejected = true; }
    if (!rejected) throw new Error(`capture adapter accepted unsafe registry URL ${value}`);
  }
  let invalidBooleanRejected = false;
  try { parseOptions(["--verify-immutable-release-only", "false"]); } catch { invalidBooleanRejected = true; }
  if (!invalidBooleanRejected) throw new Error("capture adapter accepted a false boolean-mode flag");
  const temporary = await mkdtemp(join(tmpdir(), "kasb-capture-self-test-"));
  try {
    let rejected = false;
    try {
      await commandToFile(process.execPath, ["-e", "process.stdout.write('12345')"], join(temporary, "oversized"), { maxBytes: 4, timeoutMs: 1000, stallTimeoutMs: 1000 });
    } catch { rejected = true; }
    if (!rejected) throw new Error("capture adapter accepted an oversized download");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  console.log("publication-state capture adapter bounds and URL policy passed");
}

function parseOptions(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!["--commit", "--output", "--github-only", "--verify-immutable-release-only"].includes(name) || value === undefined) {
      throw new Error("Usage: node scripts/capture-release-publication-state.mjs --commit <sha> [--output <path>] [--github-only true | --verify-immutable-release-only true]");
    }
    result[name.slice(2)] = value;
  }
  if (result["github-only"] !== undefined && result["github-only"] !== "true") throw new Error("--github-only only accepts true");
  if (result["verify-immutable-release-only"] !== undefined && result["verify-immutable-release-only"] !== "true") {
    throw new Error("--verify-immutable-release-only only accepts true");
  }
  return result;
}

function required(value, message) {
  if (!value) throw new Error(message);
  return value;
}
