import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { checksummedReleaseAssetNames, loadReleaseContract, releaseAssetNames, releaseTag, repositoryRoot } from "./release-contract.mjs";
import { scanCandidateText, validateCandidateProvenance } from "./release-candidate-inspection.mjs";

export const candidateSchemaVersion = 1;
export const rehearsalRefPrefix = "refs/kasb-rehearsal/";
export const requiredCandidateGates = Object.freeze([
  "contracts",
  "generated",
  "licenses",
  "typecheck",
  "tests",
  "conformance",
  "build",
  "rustfmt",
  "clippy",
  "nativeArtifacts",
  "cleanConsumers",
]);

const sha256Pattern = /^[0-9a-f]{64}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;

export async function canonicalCandidateIdentity({ mode, ref, sha }) {
  if (mode !== "strict" && mode !== "rehearsal") {
    throw new Error("candidate mode must be strict or rehearsal");
  }
  if (!commitPattern.test(sha)) throw new Error("candidate SHA must be a full lowercase Git commit ID");

  const contract = await loadReleaseContract();
  validateCandidateVersion(contract.version, mode);
  const tag = releaseTag(contract.release, contract.version);
  const rootPackage = JSON.parse(await readFile(resolve(repositoryRoot, contract.manifest.rootPackage, "package.json"), "utf8"));
  if (mode === "strict" && ref !== `refs/tags/${tag}`) {
    throw new Error(`strict candidate ref must be refs/tags/${tag}`);
  }
  if (mode === "rehearsal" && ref !== `${rehearsalRefPrefix}${sha}`) {
    throw new Error(`rehearsal candidate ref must be ${rehearsalRefPrefix}<candidate-sha>`);
  }

  return {
    schemaVersion: candidateSchemaVersion,
    mode,
    repository: contract.release.repository,
    version: contract.version,
    canonicalTag: tag,
    sourceRef: ref,
    commit: sha,
    targets: contract.targets.map(({ rustTarget, releaseTarget, packageName, archiveName }) => ({
      rustTarget,
      releaseTarget,
      packageName,
      archiveName,
    })),
    npmPackages: [
      ...contract.targets.map(({ packageName }) => ({ name: packageName, version: contract.version, role: "native" })),
      { name: rootPackage.name, version: contract.version, role: "root" },
    ],
    githubAssets: releaseAssetNames(contract).map((name) => ({ name })),
  };
}

export function validateCandidateVersion(version, mode) {
  if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u.test(version)) {
    throw new Error(`canonical candidate version ${version} must be stable MAJOR.MINOR.PATCH`);
  }
  if (mode === "strict" && compareStableVersion(version, "0.2.1") <= 0) {
    throw new Error("strict candidate version must be newer than retired version 0.2.1");
  }
}

export async function validateArtifactManifest(identity, manifest, root = repositoryRoot) {
  assertObject(manifest, "artifact manifest");
  if (manifest.schemaVersion !== candidateSchemaVersion) throw new Error("artifact manifest schemaVersion must be 1");
  for (const field of ["repository", "version", "commit"]) {
    if (manifest[field] !== identity[field]) throw new Error(`artifact manifest ${field} differs from the candidate identity`);
  }

  const expectedTargets = identity.targets.map(({ releaseTarget }) => releaseTarget);
  const manifestTargets = Array.isArray(manifest.targets)
    ? manifest.targets.map((target) => typeof target === "string" ? target : target?.releaseTarget)
    : manifest.targets;
  assertExactStrings(manifestTargets, expectedTargets, "artifact manifest target set");
  validateGates(manifest.gates);

  const contract = await loadReleaseContract();
  const rootPackage = JSON.parse(await readFile(resolve(root, contract.manifest.rootPackage, "package.json"), "utf8"));
  const expectedPackages = new Map([
    ...identity.targets.map(({ packageName }) => [packageName, "native"]),
    [rootPackage.name, "root"],
  ]);
  const npmPackages = await validateFiles(manifest.npmPackages, root, "npm package");
  assertUniqueBy(npmPackages, ({ name }) => name, "npm package name");
  if (npmPackages.length !== expectedPackages.size) {
    throw new Error(`artifact manifest must contain exactly ${expectedPackages.size} npm packages`);
  }
  for (const pkg of npmPackages) {
    const expectedRole = expectedPackages.get(pkg.name);
    if (!expectedRole) throw new Error(`artifact manifest contains unexpected npm package ${pkg.name}`);
    if (pkg.version !== identity.version) throw new Error(`${pkg.name} version differs from the candidate version`);
    if (pkg.role !== expectedRole) throw new Error(`${pkg.name} must have role ${expectedRole}`);
    if (!pkg.file.endsWith(".tgz")) throw new Error(`${pkg.name} artifact must be an npm tarball`);
    if (pkg.size > contract.release.archiveLimitBytes) throw new Error(`${pkg.name} tarball exceeds the candidate artifact size limit`);
    const packed = packageJson(resolve(root, pkg.file));
    if (packed.name !== pkg.name || packed.version !== pkg.version) {
      throw new Error(`${pkg.name} manifest identity differs from its npm tarball`);
    }
  }

  const expectedAssets = new Set(releaseAssetNames(contract));
  const githubAssets = await validateFiles(manifest.githubAssets, root, "GitHub asset");
  assertUniqueBy(githubAssets, ({ name }) => name, "GitHub asset name");
  if (githubAssets.length !== expectedAssets.size) {
    throw new Error(`artifact manifest must contain exactly ${expectedAssets.size} GitHub assets`);
  }
  for (const asset of githubAssets) {
    if (!expectedAssets.has(asset.name)) throw new Error(`artifact manifest contains unexpected GitHub asset ${asset.name}`);
    if (basename(asset.file) !== asset.name) throw new Error(`${asset.name} file basename differs from its release asset name`);
    const limit = identity.targets.some(({ archiveName }) => archiveName === asset.name)
      ? contract.release.archiveLimitBytes
      : contract.release.metadataLimitBytes;
    if (asset.size > limit) throw new Error(`${asset.name} exceeds the candidate artifact size limit`);
  }
  await validateChecksumManifest(contract, githubAssets, root);
  const provenance = githubAssets.find(({ name }) => name === contract.release.provenanceAsset);
  await validateCandidateProvenance(resolve(root, provenance.file), identity);
  await scanCandidateText({ githubAssets, npmPackages }, root);

  return { ...identity, phase: "artifacts", gates: { ...manifest.gates }, npmPackages, githubAssets };
}

function packageJson(tarball) {
  const result = spawnSync("tar", ["-xOf", tarball, "package/package.json"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`could not read package.json from ${tarball}: ${result.stderr.trim()}`);
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`could not parse package.json from ${tarball}: ${error.message}`);
  }
}

async function validateChecksumManifest(contract, assets, root) {
  const checksumAsset = assets.find(({ name }) => name === contract.release.checksumAsset);
  const lines = (await readFile(resolve(root, checksumAsset.file), "utf8")).trimEnd().split(/\r?\n/u);
  const checksums = new Map();
  for (const line of lines) {
    const match = line.match(/^([0-9a-f]{64})  ([^/\\]+)$/u);
    if (!match || checksums.has(match[2])) throw new Error(`candidate checksum manifest has an invalid or duplicate entry ${JSON.stringify(line)}`);
    checksums.set(match[2], match[1]);
  }
  const expected = checksummedReleaseAssetNames(contract);
  assertExactStrings([...checksums.keys()], expected, "candidate checksum asset-name set");
  for (const name of expected) {
    if (checksums.get(name) !== assets.find((asset) => asset.name === name)?.sha256) {
      throw new Error(`candidate checksum for ${name} differs from the publishable asset bytes`);
    }
  }
}

export function validatePublicationStateSource(mode, state) {
  assertObject(state, "publication-state snapshot");
  if (state.schemaVersion !== candidateSchemaVersion) throw new Error("publication-state schemaVersion must be 1");
  const expected = mode === "strict" ? "live" : "fixture";
  if (state.source !== expected) throw new Error(`${mode} mode requires a ${expected} publication-state snapshot`);
}

export async function validatePrebuildPublicationState(identity, state) {
  const github = state.github;
  assertObject(github, "publication-state GitHub snapshot");
  if (github.schemaVersion !== 1 || github.repository !== identity.repository || github.tag !== identity.canonicalTag || github.tagSha !== identity.commit) {
    throw new Error("publication-state GitHub identity differs from the candidate");
  }
  if (github.repositoryPrivate !== false) throw new Error("canonical release repository must be public before candidate publication");
  if (github.immutableReleases !== true) throw new Error("canonical repository must enable immutable releases before candidate publication");
  if (github.release !== null) {
    assertObject(github.release, "publication-state GitHub release");
    if (github.release.tag !== identity.canonicalTag || github.release.targetSha !== identity.commit) {
      throw new Error("publication-state GitHub release identity differs from the candidate");
    }
    if (
      typeof github.release.draft !== "boolean"
      || typeof github.release.prerelease !== "boolean"
      || typeof github.release.immutable !== "boolean"
      || !Array.isArray(github.release.assets)
    ) {
      throw new Error("publication-state GitHub release has an invalid shape");
    }
    if (github.release.prerelease) throw new Error("canonical publication-state GitHub release must not be a prerelease");
    const contract = await loadReleaseContract();
    const expectedAssets = new Set(releaseAssetNames(contract));
    const seen = new Set();
    for (const asset of github.release.assets) {
      assertObject(asset, "publication-state GitHub asset");
      if (!expectedAssets.has(asset.name) || seen.has(asset.name) || !sha256Pattern.test(asset.sha256)) {
        throw new Error("publication-state GitHub assets contain an unexpected, duplicate, or invalid identity");
      }
      seen.add(asset.name);
    }
    if (identity.mode === "strict") {
      throw new Error("strict fresh candidate build found an existing GitHub Release; rerun only the failed publication job so it reuses the original successful candidate artifact");
    }
  }

  const expectedPackages = new Set(identity.npmPackages.map(({ name }) => name));
  const packages = state.npm?.packages;
  if (state.npm?.schemaVersion !== 1 || !Array.isArray(packages) || packages.length !== expectedPackages.size) {
    throw new Error("publication-state must contain every candidate npm identity exactly once");
  }
  for (const pkg of packages) {
    assertObject(pkg, "publication-state npm package");
    if (!expectedPackages.delete(pkg.name) || pkg.version !== identity.version || !["vacant", "published"].includes(pkg.state)) {
      throw new Error("publication-state contains an unexpected, duplicate, or invalid npm identity");
    }
    if (pkg.state === "published" && !sha256Pattern.test(pkg.sha256)) {
      throw new Error(`published npm identity ${pkg.name} is missing its registry tarball digest`);
    }
    if (pkg.state === "vacant" && Object.hasOwn(pkg, "sha256")) {
      throw new Error(`vacant npm identity ${pkg.name} must not include a tarball digest`);
    }
  }
  if (expectedPackages.size !== 0) throw new Error("publication-state is missing a candidate npm identity");
}

export function validateGates(gates) {
  assertObject(gates, "artifact manifest gates");
  const actual = Object.keys(gates).sort();
  const expected = [...requiredCandidateGates].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("artifact manifest gates must contain exactly the canonical deterministic gate set");
  }
  for (const gate of requiredCandidateGates) {
    if (gates[gate] !== true) throw new Error(`deterministic gate ${gate} did not pass`);
  }
}

async function validateFiles(entries, root, label) {
  if (!Array.isArray(entries)) throw new Error(`artifact manifest ${label}s must be an array`);
  const validated = [];
  const canonicalRoot = await realpath(root);
  for (const entry of entries) {
    assertObject(entry, label);
    if (typeof entry.name !== "string" || entry.name.length === 0) throw new Error(`${label} name must be a nonempty string`);
    if (typeof entry.file !== "string" || entry.file.length === 0 || isAbsolute(entry.file) || entry.file.split(/[\\/]/u).includes("..")) {
      throw new Error(`${label} ${entry.name} must use a repository-relative file path`);
    }
    if (!sha256Pattern.test(entry.sha256)) throw new Error(`${label} ${entry.name} must have a lowercase SHA-256 digest`);
    const path = resolve(root, entry.file);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} ${entry.name} must resolve to a regular non-symlink file`);
    const canonicalPath = await realpath(path);
    const fromRoot = relative(canonicalRoot, canonicalPath);
    if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
      throw new Error(`${label} ${entry.name} escapes the repository root`);
    }
    const bytes = await readFile(canonicalPath);
    if (bytes.length === 0) throw new Error(`${label} ${entry.name} must not be empty`);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== entry.sha256) throw new Error(`${label} ${entry.name} digest differs from the artifact bytes`);
    if (entry.size !== undefined && entry.size !== bytes.length) throw new Error(`${label} ${entry.name} size differs from the artifact bytes`);
    validated.push({ name: entry.name, ...(entry.version ? { version: entry.version } : {}), ...(entry.role ? { role: entry.role } : {}), file: entry.file, size: bytes.length, sha256: digest });
  }
  return validated;
}

function assertExactStrings(actual, expected, label) {
  if (!Array.isArray(actual) || actual.some((value) => typeof value !== "string")) throw new Error(`${label} must be an array of strings`);
  if (new Set(actual).size !== actual.length || JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${label} must contain every canonical identity exactly once`);
  }
}

function assertUniqueBy(values, selector, label) {
  const seen = new Set();
  for (const value of values) {
    const key = selector(value);
    if (seen.has(key)) throw new Error(`artifact manifest contains duplicate ${label} ${key}`);
    seen.add(key);
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function compareStableVersion(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return Math.sign(a[index] - b[index]);
  }
  return 0;
}
