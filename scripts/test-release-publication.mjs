import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  planGitHubPublication,
  PublicationContractError,
  validatePublicationStateSnapshot,
} from "./release-publication-contract.mjs";
import { executeGitHubPublication } from "./release-publication.mjs";
import { requiredCandidateGates } from "./release-candidate-contract.mjs";
import { compareStableVersions, highestStableVersion } from "./release-contract.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixture = JSON.parse(await readFile(resolve(repositoryRoot, "fixtures/release-publication/scenarios.json"), "utf8"));
const { candidate, vacant } = fixture;

assert.equal(compareStableVersions("9007199254740992.0.0", "9007199254740993.0.0"), -1);
assert.equal(compareStableVersions("9007199254740993.0.0", "9007199254740992.0.0"), 1);
assert.equal(highestStableVersion(["9007199254740992.0.0", "9007199254740993.0.0"]), "9007199254740993.0.0");

const initial = validatePublicationStateSnapshot(candidate, vacant);
assert.equal(initial.source, "fixture");
assert.equal(initial.github.mutationAllowed, false);
assert.deepEqual(initial.github.actions.map(({ type }) => type), ["createDraft", ...Array(8).fill("uploadAsset")]);
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
expectCode(() => planGitHubPublication(candidate, {
  ...vacant.github,
  tagSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
}, "stage"), "github_tag_sha_mismatch");
expectCode(() => planGitHubPublication(candidate, {
  ...vacant.github,
  repositoryPrivate: true,
}, "stage"), "github_repository_private");
expectCode(() => planGitHubPublication(strictCandidate, {
  ...vacant.github,
  highestPublishedVersion: "2.0.0",
}, "stage"), "candidate_version_regression");
const largeVersionCandidate = strictCandidateFixture("9007199254740992.0.0").candidate;
expectCode(() => planGitHubPublication(largeVersionCandidate, {
  schemaVersion: 1,
  repository: largeVersionCandidate.repository,
  repositoryPrivate: false,
  highestPublishedVersion: "9007199254740993.0.0",
  tag: largeVersionCandidate.canonicalTag,
  tagSha: largeVersionCandidate.commit,
  release: null,
}, "stage"), "candidate_version_regression");
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

await testWorkflowFacingReports();
await testGuardedExecutionAdapters();
console.log("release publication failure injection passed for safe GitHub reruns");

function githubState(release) {
  return {
    ...vacant.github,
    release: { tag: candidate.canonicalTag, targetSha: candidate.commit, prerelease: false, ...release },
  };
}

function publishedAsset(asset) {
  return { name: asset.name, sha256: asset.sha256 };
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

    const mismatch = structuredClone(vacant);
    mismatch.github.release = {
      tag: candidate.canonicalTag, targetSha: candidate.commit,
      draft: true, prerelease: false, immutable: false,
      assets: [{ ...publishedAsset(candidate.githubAssets[0]), sha256: "f".repeat(64) }],
    };
    await writeFile(statePath, JSON.stringify(mismatch));
    const failed = run("scripts/plan-github-publication.mjs", [
      "--candidate", candidatePath, "--state", statePath, "--output", githubOutput,
    ]);
    assert.notEqual(failed.status, 0, "GitHub mismatch CLI unexpectedly succeeded");
    const failedReport = JSON.parse(await readFile(githubOutput, "utf8"));
    assert.deepEqual({ ok: failedReport.ok, code: failedReport.error.code }, { ok: false, code: "github_asset_digest_mismatch" });

    const usageOutput = join(directory, "usage.json");
    const usage = run("scripts/plan-github-publication.mjs", ["--output", usageOutput]);
    assert.notEqual(usage.status, 0, "GitHub usage failure unexpectedly succeeded");
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
    assert.equal(error.receipt.error.code, "outcome_unknown");
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
  exactGithub.state.highestPublishedVersion = strict.version;
  exactGithub.state.release = completeRelease(strict, true);
  const skippedGithub = await executeGitHubPublication(strict, exactGithub);
  assert.deepEqual(skippedGithub.operations, []);

  const staleGithub = githubAdapter(strict, built.files);
  const permanentlyVacant = structuredClone(staleGithub.state);
  staleGithub.readState = async () => structuredClone(permanentlyVacant);
  await assert.rejects(executeGitHubPublication(strict, staleGithub), hasCode("github_staging_iteration_limit"));

  // A contents-only token cannot inspect repository settings. A published
  // mutable release must retain its bytes and produce an explicit failed receipt.
  const mutableGithub = githubAdapter(strict, built.files);
  const publish = mutableGithub.publishDraft.bind(mutableGithub);
  mutableGithub.publishDraft = async (action) => {
    await publish(action);
    mutableGithub.state.release.immutable = false;
  };
  await assert.rejects(executeGitHubPublication(strict, mutableGithub), (error) => {
    assert.equal(error.code, "github_release_not_immutable");
    assert.equal(error.receipt.ok, false);
    assert.equal(mutableGithub.state.release.draft, false);
    assert.equal(mutableGithub.state.release.assets.length, strict.githubAssets.length);
    return true;
  });
  await assert.rejects(executeGitHubPublication(strict, mutableGithub), hasCode("github_release_not_immutable"));

  await assert.rejects(executeGitHubPublication({
    ...strict,
    mode: "rehearsal",
    sourceRef: `refs/kasb-rehearsal/${strict.commit}`,
    publicationStateSource: "fixture",
  }, githubAdapter(strict, built.files)), hasCode("publication_rehearsal"));

}

function strictCandidateFixture(version = "1.0.0") {
  const commit = "1".repeat(40);
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
      retiredThroughVersion: "0.2.1",
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
      highestPublishedVersion: "0.2.1",
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

function sha(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function hasCode(code) {
  return (error) => error instanceof PublicationContractError && error.code === code;
}
