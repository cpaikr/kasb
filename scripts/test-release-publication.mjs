import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  planGitHubPublication,
  planNpmPublication,
  planNpmPublicationAfterGitHub,
  PublicationContractError,
  validatePublicationStateSnapshot,
} from "./release-publication-contract.mjs";
import { executeGitHubPublication, executeNpmPublication } from "./release-publication.mjs";
import { requiredCandidateGates } from "./release-candidate-contract.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixture = JSON.parse(await readFile(resolve(repositoryRoot, "fixtures/release-publication/scenarios.json"), "utf8"));
const { candidate, vacant } = fixture;

const initial = validatePublicationStateSnapshot(candidate, vacant);
assert.equal(initial.source, "fixture");
assert.equal(initial.github.mutationAllowed, false);
assert.equal(initial.npm.mutationAllowed, false);
assert.deepEqual(initial.github.actions.map(({ type }) => type), ["createDraft", ...Array(8).fill("uploadAsset")]);
assert.deepEqual(initial.npm.actions.map(({ role }) => role), ["native", "native", "native", "native", "root"]);
assert.deepEqual(initial.npm.actions.map(({ name }) => name), [
  "@sjunepark/kasb-linux-x64-gnu",
  "@sjunepark/kasb-linux-arm64-gnu",
  "@sjunepark/kasb-darwin-arm64",
  "@sjunepark/kasb-win32-x64-msvc",
  "@sjunepark/kasb",
]);
assert.equal(initial.npm.rootGate.status, "afterNativePublication");
expectCode(() => planGitHubPublication({ ...candidate, phase: "identity" }, vacant.github), "candidate_phase");
expectCode(() => planGitHubPublication({
  ...candidate,
  gates: { ...candidate.gates, tests: false },
}, vacant.github), "candidate_gates");
expectCode(() => planGitHubPublication({
  ...candidate,
  publicationStateSource: "live",
}, vacant.github), "candidate_publication_state_source");
expectCode(() => validatePublicationStateSnapshot({
  ...candidate,
  mode: "strict",
  sourceRef: `refs/tags/${candidate.canonicalTag}`,
  publicationStateSource: "live",
}, vacant), "snapshot_source");
expectCode(() => planGitHubPublication({ ...candidate, repository: "other/repository" }, vacant.github), "candidate_repository");
expectCode(() => planGitHubPublication({
  ...candidate,
  version: "not-semver",
  canonicalTag: "vnot-semver",
  npmPackages: candidate.npmPackages.map((pkg) => ({ ...pkg, version: "not-semver" })),
  targets: candidate.targets.map((target) => ({
    ...target,
    archiveName: target.archiveName.replace("1.2.3", "not-semver"),
  })),
  githubAssets: candidate.githubAssets.map((asset) => ({
    ...asset,
    name: asset.name.replace("1.2.3", "not-semver"),
    file: asset.file.replace("1.2.3", "not-semver"),
  })),
}, vacant.github), "candidate_version");
expectCode(() => planGitHubPublication({
  ...candidate,
  targets: candidate.targets.map((target, index) => index === 0 ? { ...target, packageName: "@sjunepark/invented" } : target),
}, vacant.github), "candidate_target_package");

const partialDraft = githubState({
  draft: true,
  immutable: false,
  assets: [publishedAsset(candidate.githubAssets[0])],
});
const uploadResume = planGitHubPublication(candidate, partialDraft, "stage");
assert.equal(uploadResume.status, "partial");
assert.deepEqual(uploadResume.actions, candidate.githubAssets.slice(1).map((asset) => ({ type: "uploadAsset", ...asset })));
assert.deepEqual(uploadResume.assets.map(({ status }) => status), ["exact", ...Array(7).fill("missing")]);
expectCode(() => planGitHubPublication(candidate, partialDraft, "finalize"), "github_draft_incomplete");

const completeDraft = githubState({
  draft: true,
  immutable: false,
  assets: candidate.githubAssets.map(publishedAsset),
});
assert.deepEqual(planGitHubPublication(candidate, completeDraft, "finalize").actions, [
  { type: "publishDraft", tag: candidate.canonicalTag },
]);

const mutablePublished = githubState({
  draft: false,
  immutable: false,
  assets: candidate.githubAssets.map(publishedAsset),
});
expectCode(() => planGitHubPublication(candidate, mutablePublished, "verify"), "github_release_not_immutable");

const immutablePublished = githubState({
  draft: false,
  immutable: true,
  assets: candidate.githubAssets.map(publishedAsset),
});
const githubRerun = planGitHubPublication(candidate, immutablePublished, "verify");
assert.equal(githubRerun.status, "published");
assert.deepEqual(githubRerun.actions, []);
assert(githubRerun.assets.every(({ status, action }) => status === "exact" && action === "skip"));
expectCode(() => planGitHubPublication(candidate, githubState({
  draft: false,
  prerelease: true,
  immutable: true,
  assets: candidate.githubAssets.map(publishedAsset),
}), "verify"), "github_release_prerelease");

const strictCandidate = {
  ...candidate,
  mode: "strict",
  sourceRef: `refs/tags/${candidate.canonicalTag}`,
  publicationStateSource: "live",
};
const strictPublished = {
  schemaVersion: 1,
  source: "live",
  github: immutablePublished,
  npm: vacant.npm,
};
const authorizedNpm = planNpmPublicationAfterGitHub(strictCandidate, strictPublished);
assert.equal(authorizedNpm.githubReleaseVerified, true);
assert.equal(authorizedNpm.mutationAllowed, true);
expectCode(() => planNpmPublicationAfterGitHub(strictCandidate, {
  ...strictPublished,
  github: vacant.github,
}), "github_release_missing");

expectCode(() => planGitHubPublication(candidate, {
  ...vacant.github,
  tagSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
}, "stage"), "github_tag_sha_mismatch");
expectCode(() => planGitHubPublication(candidate, {
  ...vacant.github,
  repositoryPrivate: true,
}, "stage"), "github_repository_private");
expectCode(() => planGitHubPublication(candidate, {
  ...vacant.github,
  immutableReleases: false,
}, "stage"), "github_immutability_disabled");
expectCode(() => planGitHubPublication(candidate, githubState({
  draft: true,
  immutable: false,
  assets: [{ ...publishedAsset(candidate.githubAssets[0]), sha256: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" }],
}), "stage"), "github_asset_digest_mismatch");
expectCode(() => planGitHubPublication(candidate, githubState({
  draft: true,
  immutable: false,
  assets: [publishedAsset(candidate.githubAssets[0]), publishedAsset(candidate.githubAssets[0])],
}), "stage"), "github_duplicate_asset");
expectCode(() => planGitHubPublication(candidate, githubState({
  draft: true,
  immutable: false,
  assets: [{ name: "unexpected.zip", sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" }],
}), "stage"), "github_unexpected_asset");

const firstNative = candidate.npmPackages.find(({ name }) => name.endsWith("linux-x64-gnu"));
const secondNative = candidate.npmPackages.find(({ name }) => name.endsWith("linux-arm64-gnu"));
const otherNatives = candidate.npmPackages.filter(({ role, name }) => role === "native" && name !== firstNative.name && name !== secondNative.name);
const rootPackage = candidate.npmPackages.find(({ role }) => role === "root");
const partialNpm = npmState([
  publishedPackage(firstNative),
  vacantPackage(secondNative),
  ...otherNatives.map(vacantPackage),
  vacantPackage(rootPackage),
]);
const npmResume = planNpmPublication(candidate, partialNpm);
assert.equal(npmResume.status, "partial");
assert.equal(npmResume.classifications.find(({ name }) => name === firstNative.name).action, "skip");
assert.deepEqual(npmResume.actions.map(({ name }) => name), [
  ...candidate.npmPackages.filter(({ role, name }) => role === "native" && name !== firstNative.name).map(({ name }) => name),
  rootPackage.name,
]);
assert.equal(npmResume.rootGate.status, "afterNativePublication");

const rootFailure = npmState([
  publishedPackage(firstNative),
  publishedPackage(secondNative),
  ...otherNatives.map(publishedPackage),
  vacantPackage(rootPackage),
]);
const rootRetry = planNpmPublication(candidate, rootFailure);
assert.deepEqual(rootRetry.actions.map(({ name }) => name), [rootPackage.name]);
assert.equal(rootRetry.rootGate.status, "ready");

const completeNpm = npmState(candidate.npmPackages.map(publishedPackage));
const npmRerun = planNpmPublication(candidate, completeNpm);
assert.equal(npmRerun.status, "published");
assert.deepEqual(npmRerun.actions, []);
assert(npmRerun.classifications.every(({ status, action }) => status === "exact" && action === "skip"));

expectCode(() => planNpmPublication(candidate, npmState([
  { ...publishedPackage(firstNative), sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" },
  vacantPackage(secondNative),
  ...otherNatives.map(vacantPackage),
  vacantPackage(rootPackage),
])), "npm_digest_mismatch");
expectCode(() => planNpmPublication(candidate, npmState([
  vacantPackage(firstNative),
  vacantPackage(secondNative),
])), "npm_snapshot_incomplete");
expectCode(() => planNpmPublication(candidate, npmState([
  vacantPackage(firstNative),
  vacantPackage(firstNative),
  vacantPackage(secondNative),
  ...otherNatives.map(vacantPackage),
  vacantPackage(rootPackage),
])), "npm_duplicate_identity");

// A concurrent publisher racing a vacant plan is safe only when the occupied
// registry tarball is the exact original candidate artifact.
const exactRace = planNpmPublication(candidate, npmState(candidate.npmPackages.map((pkg) =>
  pkg.name === firstNative.name ? publishedPackage(pkg) : vacantPackage(pkg)
)));
assert.equal(exactRace.classifications.find(({ name }) => name === firstNative.name).action, "skip");
expectCode(() => planNpmPublication(candidate, npmState(candidate.npmPackages.map((pkg) =>
  pkg.name === firstNative.name
    ? { ...publishedPackage(pkg), sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" }
    : vacantPackage(pkg)
))), "npm_digest_mismatch");

await testWorkflowFacingReports();
await testGuardedExecutionAdapters();
console.log("release publication failure injection passed for safe GitHub and npm reruns");

function githubState(release) {
  return {
    ...vacant.github,
    release: { tag: candidate.canonicalTag, targetSha: candidate.commit, prerelease: false, ...release },
  };
}

function npmState(packages) {
  return { schemaVersion: 1, packages };
}

function publishedAsset(asset) {
  return { name: asset.name, sha256: asset.sha256 };
}

function publishedPackage(pkg) {
  return { name: pkg.name, version: pkg.version, state: "published", sha256: pkg.sha256 };
}

function vacantPackage(pkg) {
  return { name: pkg.name, version: pkg.version, state: "vacant" };
}

function expectCode(operation, code) {
  assert.throws(operation, (error) => error instanceof PublicationContractError && error.code === code);
}

async function testWorkflowFacingReports() {
  const directory = await mkdtemp(join(tmpdir(), "kasb-publication-"));
  try {
    const candidatePath = join(directory, "candidate.json");
    const statePath = join(directory, "state.json");
    const githubOutput = join(directory, "github.json");
    const npmOutput = join(directory, "npm.json");
    await writeFile(candidatePath, JSON.stringify(candidate));
    await writeFile(statePath, JSON.stringify(vacant));

    const github = run("scripts/plan-github-publication.mjs", [
      "--candidate", candidatePath,
      "--state", statePath,
      "--output", githubOutput,
      "--phase", "stage",
    ]);
    assert.equal(github.status, 0, github.stderr);
    const githubReport = JSON.parse(await readFile(githubOutput, "utf8"));
    assert.equal(githubReport.ok, true);
    assert.equal(githubReport.actions[0].type, "createDraft");

    const mismatch = structuredClone(strictPublished);
    mismatch.npm.packages[0] = {
      ...mismatch.npm.packages[0],
      state: "published",
      sha256: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    };
    await writeFile(statePath, JSON.stringify(mismatch));
    await writeFile(candidatePath, JSON.stringify(strictCandidate));
    const npm = run("scripts/plan-npm-publication.mjs", [
      "--candidate", candidatePath,
      "--state", statePath,
      "--output", npmOutput,
    ]);
    assert.notEqual(npm.status, 0, "npm mismatch CLI unexpectedly succeeded");
    const npmReport = JSON.parse(await readFile(npmOutput, "utf8"));
    assert.deepEqual({ ok: npmReport.ok, code: npmReport.error.code }, { ok: false, code: "npm_digest_mismatch" });

    const usageOutput = join(directory, "usage.json");
    const usage = run("scripts/plan-npm-publication.mjs", ["--output", usageOutput]);
    assert.notEqual(usage.status, 0, "npm usage failure unexpectedly succeeded");
    const usageReport = JSON.parse(await readFile(usageOutput, "utf8"));
    assert.deepEqual({ ok: usageReport.ok, code: usageReport.error.code }, { ok: false, code: "unexpected_error" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function run(script, args) {
  return spawnSync(process.execPath, [resolve(repositoryRoot, script), ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

async function testGuardedExecutionAdapters() {
  const built = strictCandidateFixture();
  const strict = built.candidate;

  // Every possible post-upload response loss is reconciled in the same run by
  // observing the exact uploaded bytes.
  for (let failAfterUpload = 1; failAfterUpload <= strict.githubAssets.length; failAfterUpload += 1) {
    const adapter = githubAdapter(strict, built.files, { failAfterUpload });
    const resumed = await executeGitHubPublication(strict, adapter);
    assert.equal(resumed.ok, true);
    assert.equal(resumed.immutable, true);
    assert(resumed.operations.some(({ status }) => status === "skippedExactRace"));
    assert.equal(adapter.state.release.assets.length, strict.githubAssets.length);
    assert.equal(new Set(adapter.state.release.assets.map(({ name }) => name)).size, strict.githubAssets.length);
  }

  // A failure before the remote state changes remains externally visible, and
  // the next run resumes from the exact partial draft.
  for (let failBeforeUpload = 1; failBeforeUpload <= strict.githubAssets.length; failBeforeUpload += 1) {
    const adapter = githubAdapter(strict, built.files, { failBeforeUpload });
    await assert.rejects(executeGitHubPublication(strict, adapter), (error) => {
      assert.equal(error.receipt.operations.at(-1).status, "failed");
      return /injected pre-upload interruption/u.test(error.message);
    });
    adapter.failBeforeUpload = undefined;
    const resumed = await executeGitHubPublication(strict, adapter);
    assert.equal(resumed.ok, true);
    assert.equal(resumed.immutable, true);
  }

  // If the upload response and its immediate state reconciliation both fail,
  // the receipt preserves the ambiguous attempted mutation. The exact remote
  // bytes still make the next run safely resumable.
  const unknownGithub = githubAdapter(strict, built.files, { doubleFailureAfterUpload: 1 });
  await assert.rejects(executeGitHubPublication(strict, unknownGithub), (error) => {
    const operation = error.receipt.operations.at(-1);
    assert.deepEqual(
      { type: operation.type, status: operation.status, name: operation.name },
      { type: "uploadAsset", status: "outcomeUnknown", name: strict.githubAssets[0].name },
    );
    return /injected upload interruption/u.test(error.message);
  });
  const resumedUnknownGithub = await executeGitHubPublication(strict, unknownGithub);
  assert.equal(resumedUnknownGithub.ok, true);
  assert.equal(unknownGithub.state.release.assets.length, strict.githubAssets.length);
  assert.equal(new Set(unknownGithub.state.release.assets.map(({ name }) => name)).size, strict.githubAssets.length);

  const exactGithub = githubAdapter(strict, built.files);
  exactGithub.state.release = completeRelease(strict, true);
  const skippedGithub = await executeGitHubPublication(strict, exactGithub);
  assert.deepEqual(skippedGithub.operations, []);

  const immutableReceipt = await executeGitHubPublication(strict, githubAdapter(strict, built.files));
  const allVacant = npmAdapter(built.files);
  const npmReceipt = await executeNpmPublication(strict, immutableReceipt, allVacant);
  assert.equal(npmReceipt.ok, true);
  assert.deepEqual(allVacant.published.map(({ role }) => role), ["native", "native", "native", "native", "root"]);

  const partial = npmAdapter(built.files);
  partial.registry.set(identity(strict.npmPackages[0]), built.files.get(strict.npmPackages[0].file));
  const partialReceipt = await executeNpmPublication(strict, immutableReceipt, partial);
  assert.equal(partialReceipt.ok, true);
  assert(!partial.published.some(({ name }) => name === strict.npmPackages[0].name));

  const rootFailure = npmAdapter(built.files, { failRoot: true });
  await assert.rejects(executeNpmPublication(strict, immutableReceipt, rootFailure), (error) => {
    assert.equal(error.receipt.ok, false);
    assert(error.receipt.operations.slice(0, -1).every(({ role, status }) => role === "native" && status === "completed"));
    assert.deepEqual(
      { role: error.receipt.operations.at(-1).role, status: error.receipt.operations.at(-1).status },
      { role: "root", status: "failed" },
    );
    return /injected root failure/u.test(error.message);
  });
  rootFailure.failRoot = false;
  assert.equal((await executeNpmPublication(strict, immutableReceipt, rootFailure)).ok, true);

  const raced = npmAdapter(built.files, { raceIdentity: identity(strict.npmPackages[0]), raceBytes: "exact", ambiguousFailure: true });
  const raceReceipt = await executeNpmPublication(strict, immutableReceipt, raced);
  assert(raceReceipt.operations.some(({ status }) => status === "skippedExactRace"));
  const mismatchedRace = npmAdapter(built.files, { raceIdentity: identity(strict.npmPackages[0]), raceBytes: "mismatch" });
  await assert.rejects(executeNpmPublication(strict, immutableReceipt, mismatchedRace), hasCode("npm_digest_mismatch"));

  const unknownNpmIdentity = identity(strict.npmPackages[0]);
  const unknownNpm = npmAdapter(built.files, { doubleFailureIdentity: unknownNpmIdentity });
  await assert.rejects(executeNpmPublication(strict, immutableReceipt, unknownNpm), (error) => {
    const operation = error.receipt.operations.at(-1);
    assert.deepEqual(
      { type: operation.type, status: operation.status, name: operation.name, version: operation.version },
      { type: "publishPackage", status: "outcomeUnknown", name: strict.npmPackages[0].name, version: strict.version },
    );
    return /publish response timed out/u.test(error.message);
  });
  const resumedUnknownNpm = await executeNpmPublication(strict, immutableReceipt, unknownNpm);
  assert.equal(resumedUnknownNpm.ok, true);
  assert(!unknownNpm.published.some(({ name }) => name === strict.npmPackages[0].name));

  await assert.rejects(executeNpmPublication(strict, { ...immutableReceipt, immutable: false }, npmAdapter(built.files)), hasCode("npm_github_gate"));
  await assert.rejects(executeNpmPublication({
    ...strict,
    mode: "rehearsal",
    sourceRef: `refs/kasb-rehearsal/${strict.commit}`,
    publicationStateSource: "fixture",
  }, immutableReceipt, npmAdapter(built.files)), hasCode("publication_rehearsal"));
}

function strictCandidateFixture() {
  const commit = "1".repeat(40);
  const version = "1.0.0";
  const files = new Map();
  const targets = [
    ["linux-x64-gnu", "@sjunepark/kasb-linux-x64-gnu"],
    ["linux-arm64-gnu", "@sjunepark/kasb-linux-arm64-gnu"],
    ["darwin-arm64", "@sjunepark/kasb-darwin-arm64"],
    ["win32-x64-msvc", "@sjunepark/kasb-win32-x64-msvc"],
  ].map(([releaseTarget, packageName]) => ({
    releaseTarget,
    packageName,
    archiveName: `kasb-${version}-${releaseTarget}.tar.gz`,
  }));
  const artifact = (name, file, role) => {
    const bytes = Buffer.from(`validated candidate bytes:${name}\n`);
    files.set(file, bytes);
    return { name, file, size: bytes.length, sha256: sha(bytes), ...(role ? { version, role } : {}) };
  };
  const githubAssets = [
    ...targets.map(({ archiveName }) => archiveName),
    "SHA256SUMS", "install.sh", "install.ps1", "provenance.json",
  ].map((name) => artifact(name, `github/${name}`));
  const npmPackages = [
    ...targets.map(({ packageName }) => artifact(packageName, `npm/${packageName.replace(/[^a-z0-9]+/giu, "-")}.tgz`, "native")),
    artifact("@sjunepark/kasb", "npm/root.tgz", "root"),
  ];
  return {
    files,
    candidate: {
      schemaVersion: 1,
      mode: "strict",
      phase: "artifacts",
      publicationStateSource: "live",
      gates: Object.fromEntries(requiredCandidateGates.map((gate) => [gate, true])),
      repository: "cpaikr/kasb",
      version,
      canonicalTag: `v${version}`,
      sourceRef: `refs/tags/v${version}`,
      commit,
      targets,
      githubAssets,
      npmPackages,
    },
  };
}

function githubAdapter(candidate, files, options = {}) {
  return {
    state: {
      schemaVersion: 1,
      repository: candidate.repository,
      repositoryPrivate: false,
      immutableReleases: true,
      tag: candidate.canonicalTag,
      tagSha: candidate.commit,
      release: null,
    },
    files,
    failAfterUpload: options.failAfterUpload,
    failBeforeUpload: options.failBeforeUpload,
    doubleFailureAfterUpload: options.doubleFailureAfterUpload,
    failNextRead: false,
    uploads: 0,
    async readState() {
      if (this.failNextRead) {
        this.failNextRead = false;
        throw new Error("injected GitHub reconciliation failure");
      }
      return structuredClone(this.state);
    },
    async readCandidateFile(path) { return this.files.get(path); },
    async createDraft({ tag, targetSha }) {
      this.state.release = { tag, targetSha, draft: true, prerelease: false, immutable: false, assets: [] };
    },
    async uploadAsset({ name, bytes }) {
      this.uploads += 1;
      if (this.uploads === this.failBeforeUpload) throw new Error("injected pre-upload interruption");
      this.state.release.assets.push({ name, sha256: sha(bytes) });
      if (this.uploads === this.doubleFailureAfterUpload) {
        this.doubleFailureAfterUpload = undefined;
        this.failNextRead = true;
        throw new Error("injected upload interruption");
      }
      if (this.uploads === this.failAfterUpload) throw new Error("injected upload interruption");
    },
    async publishDraft() {
      this.state.release.draft = false;
      this.state.release.immutable = true;
    },
  };
}

function completeRelease(candidate, immutable) {
  return {
    tag: candidate.canonicalTag,
    targetSha: candidate.commit,
    draft: false,
    prerelease: false,
    immutable,
    assets: candidate.githubAssets.map(({ name, sha256 }) => ({ name, sha256 })),
  };
}

function npmAdapter(files, options = {}) {
  return {
    files,
    registry: new Map(),
    published: [],
    failRoot: options.failRoot,
    raceIdentity: options.raceIdentity,
    raceBytes: options.raceBytes,
    ambiguousFailure: options.ambiguousFailure,
    doubleFailureIdentity: options.doubleFailureIdentity,
    failNextInspectIdentity: undefined,
    async readCandidateFile(path) { return this.files.get(path); },
    async inspectPackage(pkg) {
      const key = identity(pkg);
      if (this.failNextInspectIdentity === key) {
        this.failNextInspectIdentity = undefined;
        throw new Error("injected npm reconciliation failure");
      }
      const bytes = this.registry.get(key);
      return bytes ? { state: "published", bytes } : { state: "vacant" };
    },
    async publishPackage(pkg) {
      const key = identity(pkg);
      if (this.doubleFailureIdentity === key) {
        this.doubleFailureIdentity = undefined;
        this.registry.set(key, pkg.bytes);
        this.failNextInspectIdentity = key;
        throw new Error("publish response timed out");
      }
      if (this.raceIdentity === key) {
        this.registry.set(key, this.raceBytes === "exact" ? pkg.bytes : Buffer.from("different registry bytes"));
        this.raceIdentity = undefined;
        const error = new Error(this.ambiguousFailure ? "publish response timed out" : "publish conflict");
        if (!this.ambiguousFailure) error.code = "E409";
        throw error;
      }
      if (pkg.role === "root" && this.failRoot) throw new Error("injected root failure");
      this.registry.set(key, pkg.bytes);
      this.published.push({ name: pkg.name, role: pkg.role });
    },
    isConflict(error) { return error?.code === "E409"; },
  };
}

function identity(pkg) {
  return `${pkg.name}@${pkg.version}`;
}

function sha(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function hasCode(code) {
  return (error) => error instanceof PublicationContractError && error.code === code;
}
