import { createHash } from "node:crypto";
import {
  planGitHubPublication,
  planNpmPublication,
  PublicationContractError,
  validateCandidateForPublication,
} from "./release-publication-contract.mjs";

const defaultRegistryLimit = 128 * 1024 * 1024;

export async function executeGitHubPublication(candidateInput, adapter) {
  const candidate = strictCandidate(candidateInput);
  requireAdapter(adapter, ["readState", "readCandidateFile", "createDraft", "uploadAsset", "publishDraft"]);
  const receipt = baseReceipt("github", candidate);
  const maxStagingIterations = candidate.githubAssets.length + 2;
  try {
    for (let iteration = 0;; iteration += 1) {
      if (iteration >= maxStagingIterations) {
        fail("github_staging_iteration_limit", "GitHub publication state did not converge within the bounded staging plan");
      }
      const state = await adapter.readState();
      const plan = planGitHubPublication(candidate, state, "stage");
      if (plan.actions.length === 0) break;
      const [firstAction] = plan.actions;
      if (firstAction.type === "createDraft") {
        const action = firstAction;
        const operation = pendingOperation(receipt, { type: "createDraft", tag: action.tag });
        try {
          await adapter.createDraft({ tag: action.tag, targetSha: action.targetSha });
          operation.status = "completed";
        } catch (error) {
          let state;
          try {
            state = await adapter.readState();
          } catch {
            operation.status = "outcomeUnknown";
            throw error;
          }
          let raced;
          try {
            raced = planGitHubPublication(candidate, state, "stage");
          } catch (reconciliationError) {
            operation.status = "failed";
            throw reconciliationError;
          }
          if (raced.actions.some(({ type }) => type === "createDraft")) {
            operation.status = "failed";
            throw error;
          }
          operation.status = "skippedExactRace";
        }
        continue;
      }
      for (const action of plan.actions) {
        if (action.type !== "uploadAsset") fail("github_unexpected_action", `unexpected GitHub action ${action.type}`);
        const artifact = candidate.githubAssets.find(({ name }) => name === action.name);
        const bytes = await verifiedCandidateBytes(adapter, artifact);
        const operation = pendingOperation(receipt, { type: "uploadAsset", name: artifact.name, sha256: artifact.sha256 });
        try {
          await adapter.uploadAsset({ ...artifact, bytes });
          operation.status = "completed";
        } catch (error) {
          let state;
          try {
            state = await adapter.readState();
          } catch {
            operation.status = "outcomeUnknown";
            throw error;
          }
          let raced;
          try {
            raced = planGitHubPublication(candidate, state, "stage");
          } catch (reconciliationError) {
            operation.status = "failed";
            throw reconciliationError;
          }
          if (raced.actions.some(({ type, name }) => type === "uploadAsset" && name === artifact.name)) {
            operation.status = "failed";
            throw error;
          }
          operation.status = "skippedExactRace";
        }
      }
    }

    const finalization = planGitHubPublication(candidate, await adapter.readState(), "finalize");
    if (finalization.actions.length === 1) {
      const operation = pendingOperation(receipt, { type: "publishDraft", tag: candidate.canonicalTag });
      try {
        await adapter.publishDraft({ tag: candidate.canonicalTag });
        operation.status = "completed";
      } catch (error) {
        let state;
        try {
          state = await adapter.readState();
        } catch {
          operation.status = "outcomeUnknown";
          throw error;
        }
        let raced;
        try {
          raced = planGitHubPublication(candidate, state, "verify");
        } catch {
          operation.status = "failed";
          throw error;
        }
        if (raced.status !== "published") {
          operation.status = "failed";
          throw error;
        }
        operation.status = "skippedExactRace";
      }
    } else if (finalization.actions.length !== 0) {
      fail("github_finalize_actions", "GitHub finalization produced an invalid action set");
    }
    const verified = planGitHubPublication(candidate, await adapter.readState(), "verify");
    receipt.ok = true;
    receipt.immutable = true;
    receipt.assets = verified.assets.map(({ name, sha256 }) => ({ name, sha256 }));
    return receipt;
  } catch (error) {
    throw withReceipt(error, receipt);
  }
}

export async function executeNpmPublication(candidateInput, githubReceipt, adapter, { maxRegistryTarballBytes = defaultRegistryLimit } = {}) {
  const candidate = strictCandidate(candidateInput);
  requireImmutableGitHubReceipt(candidate, githubReceipt);
  requireAdapter(adapter, ["inspectPackage", "readCandidateFile", "publishPackage"]);
  if (!Number.isSafeInteger(maxRegistryTarballBytes) || maxRegistryTarballBytes <= 0) {
    fail("npm_tarball_limit", "npm registry tarball limit must be a positive safe integer");
  }
  const receipt = baseReceipt("npm", candidate);
  try {
    const snapshot = await npmSnapshot(candidate, adapter, maxRegistryTarballBytes);
    const initial = planNpmPublication(candidate, snapshot);
    for (const action of initial.actions) {
      if (action.role === "root") await requireAllNativesExact(candidate, adapter, maxRegistryTarballBytes);
      const pkg = candidate.npmPackages.find(({ name, version }) => name === action.name && version === action.version);
      const current = await inspectOne(pkg, adapter, maxRegistryTarballBytes);
      if (current.state === "published") {
        if (current.sha256 !== pkg.sha256) npmMismatch(pkg, current.sha256);
        receipt.operations.push({ type: "publishPackage", status: "skippedExact", name: pkg.name, version: pkg.version });
        continue;
      }
      const bytes = await verifiedCandidateBytes(adapter, pkg);
      const operation = pendingOperation(receipt, {
        type: "publishPackage",
        name: pkg.name,
        version: pkg.version,
        role: pkg.role,
      });
      try {
        await adapter.publishPackage({ ...pkg, bytes }, { access: "public", provenance: true });
        operation.status = "completed";
      } catch (error) {
        let raced;
        try {
          raced = await inspectOne(pkg, adapter, maxRegistryTarballBytes);
        } catch {
          operation.status = "outcomeUnknown";
          throw error;
        }
        if (raced.state === "vacant") {
          operation.status = "failed";
          throw error;
        }
        if (raced.state !== "published" || raced.sha256 !== pkg.sha256) {
          operation.status = "failed";
          npmMismatch(pkg, raced.sha256);
        }
        operation.status = "skippedExactRace";
      }
    }
    const verified = planNpmPublication(candidate, await npmSnapshot(candidate, adapter, maxRegistryTarballBytes));
    if (verified.actions.length !== 0) fail("npm_publication_incomplete", "npm publication remains incomplete after execution");
    receipt.ok = true;
    receipt.packages = verified.classifications.map(({ name, version, sha256 }) => ({ name, version, sha256 }));
    return receipt;
  } catch (error) {
    throw withReceipt(error, receipt);
  }
}

async function npmSnapshot(candidate, adapter, limit) {
  const packages = [];
  for (const pkg of candidate.npmPackages) packages.push(await inspectOne(pkg, adapter, limit));
  return { schemaVersion: 1, packages };
}

async function inspectOne(pkg, adapter, limit) {
  const observed = await adapter.inspectPackage({ name: pkg.name, version: pkg.version, maxBytes: limit });
  if (!observed || typeof observed !== "object") {
    fail("npm_registry_state", `${pkg.name}@${pkg.version} returned no explicit registry state`);
  }
  if (observed.state === "vacant") return { name: pkg.name, version: pkg.version, state: "vacant" };
  if (observed.state !== "published" || !Buffer.isBuffer(observed.bytes)) {
    fail("npm_registry_state", `${pkg.name}@${pkg.version} returned an invalid bounded registry response`);
  }
  if (observed.bytes.length === 0 || observed.bytes.length > limit) {
    fail("npm_registry_tarball_size", `${pkg.name}@${pkg.version} registry tarball exceeds the bounded size contract`);
  }
  return {
    name: pkg.name,
    version: pkg.version,
    state: "published",
    sha256: digest(observed.bytes),
  };
}

async function requireAllNativesExact(candidate, adapter, limit) {
  for (const pkg of candidate.npmPackages.filter(({ role }) => role === "native")) {
    const observed = await inspectOne(pkg, adapter, limit);
    if (observed.state !== "published" || observed.sha256 !== pkg.sha256) {
      fail("npm_root_blocked", "root npm publication is blocked until every native identity is exact");
    }
  }
}

async function verifiedCandidateBytes(adapter, artifact) {
  const bytes = await adapter.readCandidateFile(artifact.file);
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) fail("candidate_file", `${artifact.name} candidate bytes are unavailable`);
  if (artifact.size !== undefined && bytes.length !== artifact.size) fail("candidate_size", `${artifact.name} candidate size changed after validation`);
  if (digest(bytes) !== artifact.sha256) fail("candidate_digest", `${artifact.name} candidate bytes changed after validation`);
  return bytes;
}

function requireImmutableGitHubReceipt(candidate, receipt) {
  if (!receipt || receipt.ok !== true || receipt.channel !== "github" || receipt.immutable !== true
    || receipt.repository !== candidate.repository || receipt.tag !== candidate.canonicalTag || receipt.commit !== candidate.commit) {
    fail("npm_github_gate", "npm publication requires a successful immutable GitHub receipt for this exact candidate");
  }
  const expected = new Map(candidate.githubAssets.map(({ name, sha256 }) => [name, sha256]));
  for (const asset of receipt.assets ?? []) {
    if (expected.get(asset.name) !== asset.sha256) fail("npm_github_gate", "GitHub receipt asset identity differs from the candidate");
    expected.delete(asset.name);
  }
  if (expected.size !== 0) fail("npm_github_gate", "GitHub receipt does not cover every candidate asset");
}

function strictCandidate(value) {
  const candidate = validateCandidateForPublication(value);
  if (candidate.mode !== "strict") fail("publication_rehearsal", "rehearsal candidates are structurally non-publishing");
  return candidate;
}

function baseReceipt(channel, candidate) {
  return { schemaVersion: 1, ok: false, channel, repository: candidate.repository, version: candidate.version, tag: candidate.canonicalTag, commit: candidate.commit, operations: [] };
}

function pendingOperation(receipt, operation) {
  const pending = { ...operation, status: "pending" };
  receipt.operations.push(pending);
  return pending;
}

function npmMismatch(pkg, registrySha256) {
  fail("npm_digest_mismatch", `${pkg.name}@${pkg.version} is occupied by different bytes`, { candidateSha256: pkg.sha256, registrySha256 });
}

function requireAdapter(adapter, methods) {
  for (const method of methods) if (typeof adapter?.[method] !== "function") fail("publication_adapter", `publication adapter is missing ${method}()`);
}

function withReceipt(error, receipt) {
  const failure = error instanceof Error ? error : new Error(String(error));
  failure.receipt = { ...receipt, error: { code: error instanceof PublicationContractError ? error.code : "operation_failed", message: failure.message } };
  return failure;
}

function fail(code, message, details) {
  throw new PublicationContractError(code, message, details);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
