import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { canonicalCandidateIdentity, requiredCandidateGates, validateArtifactManifest, validateCandidateVersion, validatePrebuildPublicationState, validatePublicationStateSource } from "./release-candidate-contract.mjs";
import { checksummedReleaseAssetNames, loadReleaseContract, releaseAssetNames, repositoryRoot } from "./release-contract.mjs";

const sha = "a".repeat(40);
const identity = await canonicalCandidateIdentity({ mode: "rehearsal", ref: `refs/kasb-rehearsal/${sha}`, sha });
const directory = await mkdtemp(join(repositoryRoot, ".release-candidate-test-"));

try {
  const manifest = await validManifest();
  const candidate = await validateArtifactManifest(identity, manifest);
  assert.equal(candidate.phase, "artifacts");
  assert.equal(candidate.npmPackages.length, 5);
  assert.equal(candidate.githubAssets.length, 8);
  validatePublicationStateSource("rehearsal", { schemaVersion: 1, source: "fixture" });
  validatePublicationStateSource("strict", { schemaVersion: 1, source: "live" });
  assert.throws(() => validateCandidateVersion("1.2.3-01", "rehearsal"), /stable MAJOR\.MINOR\.PATCH/u);
  assert.throws(() => validateCandidateVersion("1.2.3-..", "strict"), /stable MAJOR\.MINOR\.PATCH/u);
  assert.throws(() => validateCandidateVersion("0.2.1", "strict"), /newer than retired version/u);
  const occupied = prebuildState();
  await validatePrebuildPublicationState(identity, occupied);
  await assert.rejects(
    validatePrebuildPublicationState(identity, {
      ...occupied,
      npm: { ...occupied.npm, packages: occupied.npm.packages.map((pkg, index) => index === 0 ? { ...pkg, sha256: undefined } : pkg) },
    }),
    /missing its registry tarball digest/u,
  );

  await rejectsWith({ ...manifest, targets: manifest.targets.slice(1) }, /target set must contain every canonical identity exactly once/u);
  await rejectsWith({ ...manifest, gates: { ...manifest.gates, tests: false } }, /deterministic gate tests did not pass/u);
  await rejectsWith({ ...manifest, gates: { ...manifest.gates, surprise: true } }, /exactly the canonical deterministic gate set/u);
  await rejectsWith({ ...manifest, npmPackages: [...manifest.npmPackages, manifest.npmPackages[0]] }, /duplicate npm package name/u);
  await rejectsWith({ ...manifest, npmPackages: manifest.npmPackages.map((pkg, index) => index === 0 ? { ...pkg, sha256: "0".repeat(64) } : pkg) }, /digest differs from the artifact bytes/u);
  const mislabeledTarball = await npmFixture("@sjunepark/not-kasb", "native");
  await rejectsWith({
    ...manifest,
    npmPackages: manifest.npmPackages.map((pkg, index) => index === 0 ? { ...mislabeledTarball, name: pkg.name } : pkg),
  }, /manifest identity differs from its npm tarball/u);
  await rejectsWith({ ...manifest, githubAssets: manifest.githubAssets.slice(1) }, /exactly 8 GitHub assets/u);
  const checksumIndex = manifest.githubAssets.findIndex(({ name }) => name === "SHA256SUMS");
  const checksum = manifest.githubAssets[checksumIndex];
  const badChecksumBytes = Buffer.from(
    (await readFile(resolve(repositoryRoot, checksum.file), "utf8")).replace(/^[0-9a-f]{64}/u, "0".repeat(64)),
  );
  await writeFile(resolve(repositoryRoot, checksum.file), badChecksumBytes);
  await rejectsWith({
    ...manifest,
    githubAssets: manifest.githubAssets.map((asset, index) => index === checksumIndex ? {
      ...asset,
      size: badChecksumBytes.length,
      sha256: createHash("sha256").update(badChecksumBytes).digest("hex"),
    } : asset),
  }, /candidate checksum for .* differs from the publishable asset bytes/u);
  await assert.rejects(
    canonicalCandidateIdentity({ mode: "rehearsal", ref: `refs/heads/${sha}`, sha }),
    /rehearsal candidate ref/u,
  );
  assert.throws(() => validatePublicationStateSource("rehearsal", { schemaVersion: 1, source: "live" }), /requires a fixture/u);
  assert.throws(() => validatePublicationStateSource("strict", { schemaVersion: 1, source: "fixture" }), /requires a live/u);
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log("release candidate metadata failure injection passed");

async function validManifest() {
  const npmPackages = [];
  for (const [name, role] of [
    ...identity.targets.map(({ packageName }) => [packageName, "native"]),
    ["@sjunepark/kasb", "root"],
  ]) {
    npmPackages.push(await npmFixture(name, role));
  }
  const contract = await loadReleaseContract();
  const githubNames = releaseAssetNames(contract).filter((name) => name !== contract.release.checksumAsset);
  const githubAssets = [];
  for (const name of githubNames) githubAssets.push(await fixtureFile(name, { name }));
  const checksumBody = `${checksummedReleaseAssetNames(contract)
    .map((name) => `${githubAssets.find((asset) => asset.name === name).sha256}  ${name}`)
    .join("\n")}\n`;
  githubAssets.push(await fixtureFile(contract.release.checksumAsset, { name: contract.release.checksumAsset }, checksumBody));
  return {
    schemaVersion: 1,
    repository: identity.repository,
    version: identity.version,
    commit: identity.commit,
    targets: identity.targets.map(({ releaseTarget }) => releaseTarget),
    gates: Object.fromEntries(requiredCandidateGates.map((gate) => [gate, true])),
    npmPackages,
    githubAssets,
  };
}

async function fixtureFile(name, fields, contents = `fixture:${name}\n`) {
  const path = join(directory, name);
  await mkdir(join(path, ".."), { recursive: true });
  const bytes = Buffer.from(contents);
  await writeFile(path, bytes);
  return fileDescriptor(path, fields, bytes);
}

async function npmFixture(name, role) {
  const slug = name.replace(/[^a-z0-9]+/giu, "-");
  const source = join(directory, `${slug}-source`);
  await mkdir(join(source, "package"), { recursive: true });
  await writeFile(join(source, "package", "package.json"), `${JSON.stringify({ name, version: identity.version })}\n`);
  const path = join(directory, `${slug}.tgz`);
  const packed = spawnSync("tar", ["-czf", path, "-C", source, "package"], { encoding: "utf8" });
  assert.equal(packed.status, 0, packed.stderr);
  return fileDescriptor(path, { name, version: identity.version, role }, await readFile(path));
}

function fileDescriptor(path, fields, bytes) {
  return {
    ...fields,
    file: relative(repositoryRoot, path),
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function rejectsWith(manifest, pattern) {
  await assert.rejects(validateArtifactManifest(identity, manifest), pattern);
}

function prebuildState() {
  return {
    schemaVersion: 1,
    source: "live",
    github: {
      schemaVersion: 1,
      repository: identity.repository,
      repositoryPrivate: false,
      immutableReleases: true,
      tag: identity.canonicalTag,
      tagSha: identity.commit,
      release: null,
    },
    npm: {
      schemaVersion: 1,
      packages: [
        ...identity.targets.map(({ packageName }) => ({ name: packageName, version: identity.version, state: "published", sha256: "b".repeat(64) })),
        { name: "@sjunepark/kasb", version: identity.version, state: "published", sha256: "c".repeat(64) },
      ],
    },
  };
}
