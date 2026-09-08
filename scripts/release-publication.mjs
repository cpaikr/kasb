import { createHash } from "node:crypto";
import {
  planGitHubPublication,
  PublicationContractError,
  validateCandidateForPublication,
} from "./release-publication-contract.mjs";

export async function executeGitHubPublication(candidateInput, adapter) {
  const candidate = strictCandidate(candidateInput);
  requireAdapter(adapter, ["readState", "readCandidateFile", "createDraft", "uploadAsset", "publishDraft"]);
  const receipt = baseReceipt(candidate);
  const maxStagingIterations = candidate.githubAssets.length + 2;
  try {
    for (let iteration = 0;; iteration += 1) {
      if (iteration >= maxStagingIterations) {
        fail("github_staging_iteration_limit", "GitHub publication state did not converge within the bounded staging plan");
      }
      const state = await adapter.readState();
      const plan = planGitHubPublication(candidate, state, "stage");
      if (plan.actions.length === 0) break;
      const [action] = plan.actions;
      if (action.type === "createDraft") {
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
        } catch (reconciliationError) {
          operation.status = "failed";
          throw reconciliationError;
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

async function verifiedCandidateBytes(adapter, artifact) {
  const bytes = await adapter.readCandidateFile(artifact.file);
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) fail("candidate_file", `${artifact.name} candidate bytes are unavailable`);
  if (artifact.size !== undefined && bytes.length !== artifact.size) fail("candidate_size", `${artifact.name} candidate size changed after validation`);
  if (digest(bytes) !== artifact.sha256) fail("candidate_digest", `${artifact.name} candidate bytes changed after validation`);
  return bytes;
}

function strictCandidate(value) {
  const candidate = validateCandidateForPublication(value);
  if (candidate.mode !== "strict") fail("publication_rehearsal", "rehearsal candidates are structurally non-publishing");
  return candidate;
}

function baseReceipt(candidate) {
  return { schemaVersion: 1, ok: false, channel: "github", repository: candidate.repository, version: candidate.version, tag: candidate.canonicalTag, commit: candidate.commit, operations: [] };
}

function pendingOperation(receipt, operation) {
  const pending = { ...operation, status: "pending" };
  receipt.operations.push(pending);
  return pending;
}

function requireAdapter(adapter, methods) {
  for (const method of methods) if (typeof adapter?.[method] !== "function") fail("publication_adapter", `publication adapter is missing ${method}()`);
}

function withReceipt(error, receipt) {
  const failure = error instanceof Error ? error : new Error(String(error));
  const code = receipt.operations.some(({ status }) => status === "outcomeUnknown")
    ? "outcome_unknown"
    : error instanceof PublicationContractError
      ? error.code
      : "operation_failed";
  failure.receipt = { ...receipt, error: { code, message: failure.message } };
  return failure;
}

function fail(code, message, details) {
  throw new PublicationContractError(code, message, details);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
