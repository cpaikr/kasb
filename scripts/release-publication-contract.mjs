import { requiredCandidateGates } from "./release-candidate-contract.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const STABLE_SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;

export class PublicationContractError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "PublicationContractError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function validateCandidateForPublication(candidate) {
  requireObject(candidate, "candidate metadata");
  requireEqual(candidate.schemaVersion, 1, "candidate_schema", "candidate metadata schemaVersion must be 1");
  requireOneOf(candidate.mode, ["strict", "rehearsal"], "candidate_mode", "candidate mode must be strict or rehearsal");
  requireEqual(candidate.phase, "artifacts", "candidate_phase", "publication requires an artifact-validated candidate");
  const expectedStateSource = candidate.mode === "strict" ? "live" : "fixture";
  requireEqual(
    candidate.publicationStateSource,
    expectedStateSource,
    "candidate_publication_state_source",
    `${candidate.mode} publication requires candidate proof from a ${expectedStateSource} publication-state snapshot`,
  );
  requireObject(candidate.gates, "candidate deterministic gates");
  const candidateGateNames = new Set(Object.keys(candidate.gates));
  const expectedGateNames = new Set(requiredCandidateGates);
  if (
    candidateGateNames.size !== expectedGateNames.size
    || [...candidateGateNames].some((gate) => !expectedGateNames.has(gate))
    || requiredCandidateGates.some((gate) => candidate.gates[gate] !== true)
  ) {
    fail("candidate_gates", "publication requires the exact all-passing canonical deterministic gate set", {
      expected: [...expectedGateNames].sort(),
      actual: [...candidateGateNames].sort(),
    });
  }
  requireEqual(candidate.repository, "cpaikr/kasb", "candidate_repository", "candidate repository must be cpaikr/kasb");
  if (typeof candidate.version !== "string" || !STABLE_SEMVER.test(candidate.version)) {
    fail("candidate_version", "candidate version must be stable canonical SemVer");
  }
  if (candidate.mode === "strict" && compareSemver(candidate.version, "0.2.1") <= 0) {
    fail("candidate_version_retired", "strict candidate version must be newer than retired version 0.2.1");
  }
  if (typeof candidate.commit !== "string" || !COMMIT.test(candidate.commit)) {
    fail("candidate_commit", "candidate commit must be a full lowercase Git commit ID");
  }
  requireString(candidate.canonicalTag, "candidate canonical tag");
  requireString(candidate.sourceRef, "candidate source ref");
  requireEqual(candidate.canonicalTag, `v${candidate.version}`, "candidate_tag", "candidate canonical tag must exactly match v<version>");
  const expectedSourceRef = candidate.mode === "strict"
    ? `refs/tags/${candidate.canonicalTag}`
    : `refs/kasb-rehearsal/${candidate.commit}`;
  requireEqual(candidate.sourceRef, expectedSourceRef, "candidate_source_ref", `${candidate.mode} candidate source ref is not canonical`);
  requireArray(candidate.targets, "candidate target list");
  if (candidate.targets.length !== 4) fail("candidate_target_count", "candidate must contain exactly four release targets");

  const canonicalTargets = new Map([
    ["linux-x64-gnu", "@sjunepark/kasb-linux-x64-gnu"],
    ["linux-arm64-gnu", "@sjunepark/kasb-linux-arm64-gnu"],
    ["darwin-arm64", "@sjunepark/kasb-darwin-arm64"],
    ["win32-x64-msvc", "@sjunepark/kasb-win32-x64-msvc"],
  ]);
  const targetPackages = new Set();
  const targetArchives = new Set();
  const releaseTargets = new Set();
  for (const target of candidate.targets) {
    requireObject(target, "candidate target");
    requireString(target.releaseTarget, "candidate release target");
    requireString(target.packageName, "candidate target package name");
    requireString(target.archiveName, "candidate target archive name");
    const expectedPackage = canonicalTargets.get(target.releaseTarget);
    if (!expectedPackage) fail("candidate_unknown_target", `candidate contains unknown release target ${target.releaseTarget}`);
    if (releaseTargets.has(target.releaseTarget)) fail("candidate_duplicate_target", `candidate release target ${target.releaseTarget} is duplicated`);
    releaseTargets.add(target.releaseTarget);
    requireEqual(target.packageName, expectedPackage, "candidate_target_package", `${target.releaseTarget} npm package identity is not canonical`);
    requireEqual(
      target.archiveName,
      `kasb-${candidate.version}-${target.releaseTarget}.tar.gz`,
      "candidate_target_archive",
      `${target.releaseTarget} archive identity is not canonical`,
    );
    if (targetPackages.has(target.packageName)) fail("candidate_duplicate_target_package", `candidate target package ${target.packageName} is duplicated`);
    if (targetArchives.has(target.archiveName)) fail("candidate_duplicate_target_archive", `candidate target archive ${target.archiveName} is duplicated`);
    targetPackages.add(target.packageName);
    targetArchives.add(target.archiveName);
  }

  const githubAssets = validateArtifacts(candidate.githubAssets, "GitHub asset");
  const npmPackages = validatePackages(candidate.npmPackages, candidate.version);
  const nativePackages = new Set(npmPackages.filter(({ role }) => role === "native").map(({ name }) => name));
  requireExactSet(nativePackages, targetPackages, "candidate native npm identities must exactly match the four release targets");
  const root = npmPackages.find(({ role }) => role === "root");
  requireEqual(root.name, "@sjunepark/kasb", "candidate_root_identity", "candidate root npm identity must be @sjunepark/kasb");
  const expectedAssets = new Set([...targetArchives, "SHA256SUMS", "install.sh", "install.ps1", "provenance.json"]);
  requireExactSet(new Set(githubAssets.map(({ name }) => name)), expectedAssets, "candidate GitHub assets must exactly match the canonical release asset set");
  return { ...candidate, githubAssets, npmPackages };
}

export function validatePublicationStateSnapshot(candidateInput, snapshot) {
  const candidate = validatePublicationStateEnvelope(candidateInput, snapshot);
  return {
    schemaVersion: 1,
    source: snapshot.source,
    github: planGitHubPublication(candidate, snapshot.github, "stage"),
    npm: planNpmPublication(candidate, snapshot.npm),
  };
}

export function validatePublicationStateEnvelope(candidateInput, snapshot) {
  const candidate = validateCandidateForPublication(candidateInput);
  requireObject(snapshot, "publication-state snapshot");
  requireEqual(snapshot.schemaVersion, 1, "snapshot_schema", "publication-state snapshot schemaVersion must be 1");
  const expectedSource = candidate.mode === "strict" ? "live" : "fixture";
  requireEqual(snapshot.source, expectedSource, "snapshot_source", `${candidate.mode} candidate requires a ${expectedSource} publication-state snapshot`);
  requireObject(snapshot.github, "publication-state GitHub snapshot");
  requireObject(snapshot.npm, "publication-state npm snapshot");
  return candidate;
}

export function planGitHubPublication(candidateInput, state, phase = "stage") {
  const candidate = validateCandidateForPublication(candidateInput);
  requireOneOf(phase, ["stage", "finalize", "verify"], "github_phase", "GitHub publication phase must be stage, finalize, or verify");
  validateGitHubIdentity(candidate, state);

  if (state.release === null) {
    if (phase !== "stage") {
      fail("github_release_missing", `cannot ${phase} a GitHub Release that has not been staged`);
    }
    return githubReport(candidate, phase, "vacant", [
      { type: "createDraft", tag: candidate.canonicalTag, targetSha: candidate.commit },
      ...candidate.githubAssets.map((asset) => uploadAction(asset)),
    ], candidate.githubAssets.map((asset) => assetDecision(asset, "missing", "upload")));
  }

  const release = state.release;
  requireObject(release, "GitHub release snapshot");
  requireEqual(release.tag, candidate.canonicalTag, "github_release_tag_mismatch", "GitHub Release tag differs from the candidate tag");
  requireEqual(release.targetSha, candidate.commit, "github_release_sha_mismatch", "GitHub Release target differs from the validated candidate commit");
  requireBoolean(release.draft, "GitHub release draft");
  requireBoolean(release.prerelease, "GitHub release prerelease");
  requireBoolean(release.immutable, "GitHub release immutable");
  if (release.prerelease) {
    fail("github_release_prerelease", "canonical publication cannot resume, finalize, or verify a prerelease");
  }
  if (release.draft && release.immutable) {
    fail("github_invalid_release_state", "a draft GitHub Release cannot already be immutable");
  }

  const decisions = reconcileGitHubAssets(candidate.githubAssets, release.assets);
  const missing = decisions.filter(({ status }) => status === "missing");

  if (!release.draft) {
    if (missing.length !== 0) {
      fail("github_published_release_incomplete", "published GitHub Release is missing validated candidate assets", { assets: missing.map(({ name }) => name) });
    }
    if (!release.immutable) {
      fail("github_release_not_immutable", "published GitHub Release is not immutable");
    }
    return githubReport(candidate, phase, "published", [], decisions);
  }

  if (phase === "verify") {
    fail("github_release_not_published", "GitHub Release is still a draft");
  }
  if (phase === "finalize") {
    if (missing.length !== 0) {
      fail("github_draft_incomplete", "GitHub draft cannot be finalized before every validated asset is staged", { assets: missing.map(({ name }) => name) });
    }
    return githubReport(candidate, phase, "staged", [{ type: "publishDraft", tag: candidate.canonicalTag }], decisions);
  }

  return githubReport(
    candidate,
    phase,
    missing.length === 0 ? "staged" : "partial",
    missing.map(({ name }) => uploadAction(candidate.githubAssets.find((asset) => asset.name === name))),
    decisions,
  );
}

export function planNpmPublication(candidateInput, state) {
  const candidate = validateCandidateForPublication(candidateInput);
  requireObject(state, "npm publication snapshot");
  requireEqual(state.schemaVersion, 1, "npm_snapshot_schema", "npm publication snapshot schemaVersion must be 1");
  requireArray(state.packages, "npm publication packages");

  const expected = new Map(candidate.npmPackages.map((pkg) => [packageIdentity(pkg), pkg]));
  const actual = new Map();
  for (const entry of state.packages) {
    requireObject(entry, "npm publication package");
    requireString(entry.name, "npm publication package name");
    requireString(entry.version, "npm publication package version");
    const identity = packageIdentity(entry);
    if (!expected.has(identity)) fail("npm_unexpected_identity", `unexpected npm publication identity ${identity}`);
    if (actual.has(identity)) fail("npm_duplicate_identity", `duplicate npm publication identity ${identity}`);
    requireOneOf(entry.state, ["vacant", "published"], "npm_package_state", `${identity} state must be vacant or published`);
    if (entry.state === "published") requireDigest(entry.sha256, `${identity} registry tarball`);
    if (entry.state === "vacant" && Object.hasOwn(entry, "sha256")) {
      fail("npm_vacant_digest", `${identity} is vacant but includes a tarball digest`);
    }
    actual.set(identity, entry);
  }
  const missingSnapshots = [...expected.keys()].filter((identity) => !actual.has(identity));
  if (missingSnapshots.length !== 0) {
    fail("npm_snapshot_incomplete", "npm publication snapshot must classify every candidate identity", { identities: missingSnapshots });
  }

  const classifications = candidate.npmPackages.map((pkg) => {
    const identity = packageIdentity(pkg);
    const published = actual.get(identity);
    if (published.state === "published" && published.sha256 !== pkg.sha256) {
      fail("npm_digest_mismatch", `${identity} is occupied by bytes that differ from the validated candidate`, {
        candidateSha256: pkg.sha256,
        registrySha256: published.sha256,
      });
    }
    return {
      name: pkg.name,
      version: pkg.version,
      role: pkg.role,
      status: published.state === "published" ? "exact" : "vacant",
      action: published.state === "published" ? "skip" : "publish",
      sha256: pkg.sha256,
    };
  });
  const ordered = [
    ...candidate.npmPackages.filter(({ role }) => role === "native"),
    ...candidate.npmPackages.filter(({ role }) => role === "root"),
  ];
  const actions = ordered
    .filter((pkg) => actual.get(packageIdentity(pkg)).state === "vacant")
    .map((pkg) => ({
      type: "publishPackage",
      name: pkg.name,
      version: pkg.version,
      role: pkg.role,
      file: pkg.file,
      sha256: pkg.sha256,
    }));
  const nativeActions = actions.filter(({ role }) => role === "native");
  const rootAction = actions.find(({ role }) => role === "root");
  return {
    schemaVersion: 1,
    channel: "npm",
    mode: candidate.mode,
    mutationAllowed: false,
    githubReleaseVerified: false,
    status: actions.length === 0 ? "published" : classifications.some(({ status }) => status === "exact") ? "partial" : "vacant",
    packageOrder: ordered.map(({ name, version }) => ({ name, version })),
    classifications,
    actions,
    rootGate: {
      status: rootAction ? (nativeActions.length === 0 ? "ready" : "afterNativePublication") : "notRequired",
      nativePackages: ordered.filter(({ role }) => role === "native").map(({ name, version }) => ({ name, version })),
    },
  };
}

export function planNpmPublicationAfterGitHub(candidateInput, snapshot) {
  const candidate = validatePublicationStateEnvelope(candidateInput, snapshot);
  const github = planGitHubPublication(candidate, snapshot.github, "verify");
  const npm = planNpmPublication(candidate, snapshot.npm);
  return {
    ...npm,
    mutationAllowed: candidate.mode === "strict",
    githubReleaseVerified: true,
    github: {
      repository: github.repository,
      tag: github.tag,
      targetSha: github.targetSha,
      status: github.status,
    },
  };
}

function validateGitHubIdentity(candidate, state) {
  requireObject(state, "GitHub publication snapshot");
  requireEqual(state.schemaVersion, 1, "github_snapshot_schema", "GitHub publication snapshot schemaVersion must be 1");
  requireEqual(state.repository, candidate.repository, "github_repository_mismatch", "GitHub publication repository differs from the candidate repository");
  requireEqual(state.repositoryPrivate, false, "github_repository_private", "canonical release repository must be public before publication");
  requireEqual(state.immutableReleases, true, "github_immutability_disabled", "canonical repository must enforce immutable releases before publication");
  requireEqual(state.tag, candidate.canonicalTag, "github_tag_mismatch", "GitHub tag differs from the candidate tag");
  requireEqual(state.tagSha, candidate.commit, "github_tag_sha_mismatch", "GitHub tag would move away from the validated candidate commit");
  if (state.release !== null) requireObject(state.release, "GitHub release snapshot");
}

function reconcileGitHubAssets(expectedAssets, actualInput) {
  requireArray(actualInput, "GitHub release assets");
  const expected = new Map(expectedAssets.map((asset) => [asset.name, asset]));
  const actual = new Map();
  for (const asset of actualInput) {
    requireObject(asset, "GitHub release asset");
    requireString(asset.name, "GitHub release asset name");
    requireDigest(asset.sha256, `GitHub release asset ${asset.name}`);
    if (!expected.has(asset.name)) fail("github_unexpected_asset", `GitHub Release contains unexpected asset ${asset.name}`);
    if (actual.has(asset.name)) fail("github_duplicate_asset", `GitHub Release contains duplicate asset ${asset.name}`);
    actual.set(asset.name, asset);
  }
  return expectedAssets.map((asset) => {
    const published = actual.get(asset.name);
    if (published && published.sha256 !== asset.sha256) {
      fail("github_asset_digest_mismatch", `GitHub Release asset ${asset.name} differs from the validated candidate`, {
        candidateSha256: asset.sha256,
        releaseSha256: published.sha256,
      });
    }
    return assetDecision(asset, published ? "exact" : "missing", published ? "skip" : "upload");
  });
}

function validateArtifacts(input, label) {
  requireArray(input, `${label} list`);
  if (input.length === 0) fail("candidate_assets_empty", `candidate ${label} list cannot be empty`);
  const names = new Set();
  return input.map((asset) => {
    requireObject(asset, label);
    requireString(asset.name, `${label} name`);
    requireString(asset.file, `${label} file`);
    requireSafeRelativePath(asset.file, `${label} file`);
    requireDigest(asset.sha256, label);
    if (names.has(asset.name)) fail("candidate_duplicate_asset", `candidate contains duplicate ${label} ${asset.name}`);
    names.add(asset.name);
    return { ...asset };
  });
}

function validatePackages(input, version) {
  requireArray(input, "candidate npm package list");
  if (input.length === 0) fail("candidate_packages_empty", "candidate npm package list cannot be empty");
  const identities = new Set();
  let roots = 0;
  const packages = input.map((pkg) => {
    requireObject(pkg, "candidate npm package");
    requireString(pkg.name, "candidate npm package name");
    requireEqual(pkg.version, version, "candidate_npm_version", `${pkg.name} version differs from the candidate version`);
    requireOneOf(pkg.role, ["native", "root"], "candidate_npm_role", `${pkg.name} must be a native or root package`);
    requireString(pkg.file, `${pkg.name} tarball file`);
    requireSafeRelativePath(pkg.file, `${pkg.name} tarball file`);
    requireDigest(pkg.sha256, `${pkg.name} candidate tarball`);
    const identity = packageIdentity(pkg);
    if (identities.has(identity)) fail("candidate_duplicate_package", `candidate contains duplicate npm identity ${identity}`);
    identities.add(identity);
    if (pkg.role === "root") roots += 1;
    return { ...pkg };
  });
  if (roots !== 1) fail("candidate_root_package", "candidate must contain exactly one root npm package");
  return packages;
}

function githubReport(candidate, phase, status, actions, assets) {
  return {
    schemaVersion: 1,
    channel: "github",
    mode: candidate.mode,
    mutationAllowed: candidate.mode === "strict",
    repository: candidate.repository,
    tag: candidate.canonicalTag,
    targetSha: candidate.commit,
    phase,
    status,
    assets,
    actions,
  };
}

function uploadAction(asset) {
  return { type: "uploadAsset", name: asset.name, file: asset.file, sha256: asset.sha256 };
}

function assetDecision(asset, status, action) {
  return { name: asset.name, status, action, sha256: asset.sha256 };
}

function packageIdentity(pkg) {
  return `${pkg.name}@${pkg.version}`;
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid_input", `${label} must be an object`);
}

function requireArray(value, label) {
  if (!Array.isArray(value)) fail("invalid_input", `${label} must be an array`);
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) fail("invalid_input", `${label} must be a non-empty string`);
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") fail("invalid_input", `${label} must be a boolean`);
}

function requireDigest(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) fail("invalid_digest", `${label} must have a lowercase SHA-256 digest`);
}

function requireSafeRelativePath(value, label) {
  if (/^(?:[a-z]:[\\/]|[\\/])/iu.test(value) || value.split(/[\\/]/u).includes("..")) {
    fail("invalid_path", `${label} must be repository-relative and cannot escape its root`);
  }
}

function requireExactSet(actual, expected, message) {
  if (actual.size !== expected.size || [...actual].some((value) => !expected.has(value))) {
    fail("candidate_identity_set", message, { expected: [...expected].sort(), actual: [...actual].sort() });
  }
}

function requireEqual(actual, expected, code, message) {
  if (actual !== expected) fail(code, message, { expected, actual });
}

function requireOneOf(actual, expected, code, message) {
  if (!expected.includes(actual)) fail(code, message, { expected, actual });
}

function fail(code, message, details) {
  throw new PublicationContractError(code, message, details);
}

function compareSemver(left, right) {
  const parse = (value) => {
    const match = value.match(/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z.-]+))?$/u);
    if (!match) fail("candidate_version", `candidate version ${value} is not SemVer`);
    return { core: match.slice(1, 4).map(Number), prerelease: match[4] };
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return Math.sign(a.core[index] - b.core[index]);
  }
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === undefined) return 1;
  if (b.prerelease === undefined) return -1;
  return a.prerelease.localeCompare(b.prerelease, "en");
}
