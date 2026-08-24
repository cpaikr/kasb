import { spawn, spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { loadReleaseContract, repositoryRoot } from "./release-contract.mjs";

const forbiddenMarkers = Object.freeze([
  /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/u,
  /\bgh[pousr]_[A-Za-z0-9_]{20,100}\b/u,
  /(?<![A-Za-z0-9_])github_pat_[A-Za-z0-9_]{20,100}(?![A-Za-z0-9_])/u,
  /\bnpm_[A-Za-z0-9]{20,100}\b/u,
  /(?<![A-Za-z0-9_])(?:AKIA|ASIA)[0-9A-Z]{16}(?![A-Za-z0-9_])/u,
]);
const archiveEntryLimit = 1024;
const markerOverlapBytes = 256;

export async function validateCandidateProvenance(path, identity) {
  const contract = await loadReleaseContract();
  const provenance = JSON.parse(await boundedText(path, contract.release.metadataLimitBytes, "provenance"));
  exactKeys(provenance, ["schemaVersion", "repository", "version", "sourceRef", "commit", "toolchain", "targets"], "provenance");
  for (const field of ["repository", "version", "sourceRef", "commit"]) {
    if (provenance[field] !== identity[field]) throw new Error(`provenance ${field} differs from the candidate identity`);
  }
  if (provenance.schemaVersion !== 1) throw new Error("provenance schemaVersion must be 1");
  exactKeys(provenance.toolchain, ["rust", "node", "npm"], "provenance toolchain");
  for (const field of ["rust", "node", "npm"]) {
    if (provenance.toolchain[field] !== contract.release.toolchain[field]) {
      throw new Error(`provenance ${field} toolchain differs from native-targets.json`);
    }
  }
  if (!Array.isArray(provenance.targets) || provenance.targets.length !== contract.targets.length) {
    throw new Error("provenance must contain the exact four-target set");
  }
  for (let index = 0; index < contract.targets.length; index += 1) {
    const expected = contract.targets[index];
    const actual = provenance.targets[index];
    exactKeys(actual, ["rustTarget", "releaseTarget", "packageName", "archiveName", "runner", "buildImage"], `provenance target ${index}`);
    for (const field of ["rustTarget", "releaseTarget", "packageName", "archiveName"]) {
      if (actual[field] !== expected[field]) throw new Error(`provenance target ${index} ${field} differs from native-targets.json`);
    }
    exactKeys(actual.runner, ["label", "os", "arch"], `provenance target ${expected.rustTarget} runner`);
    if (actual.runner.label !== expected.releaseRunner) throw new Error(`provenance runner for ${expected.rustTarget} differs from native-targets.json`);
    if (typeof actual.runner.os !== "string" || actual.runner.os.length === 0 || typeof actual.runner.arch !== "string" || actual.runner.arch.length === 0) {
      throw new Error(`provenance runner platform for ${expected.rustTarget} is incomplete`);
    }
    if (actual.buildImage !== (expected.buildContainer ?? null)) throw new Error(`provenance build image for ${expected.rustTarget} differs from native-targets.json`);
  }
  return provenance;
}

export async function scanCandidateText({ githubAssets, npmPackages }) {
  const contract = await loadReleaseContract();
  const byName = new Map(githubAssets.map((asset) => [asset.name, resolve(repositoryRoot, asset.file)]));
  const archives = new Set(contract.targets.map(({ archiveName }) => archiveName));
  for (const asset of githubAssets) {
    const path = byName.get(asset.name);
    const limit = archives.has(asset.name)
      ? contract.release.archiveLimitBytes
      : contract.release.metadataLimitBytes;
    await scanFile(path, limit, asset.name);
    if (archives.has(asset.name)) {
      await scanTar(path, asset.name, contract.release);
    }
  }
  for (const pkg of npmPackages) {
    const tarball = resolve(repositoryRoot, pkg.file);
    const label = basename(tarball);
    await scanFile(tarball, contract.release.archiveLimitBytes, label);
    await scanTar(tarball, label, contract.release);
  }
}

export function scanText(text, label) {
  for (const marker of forbiddenMarkers) {
    if (marker.test(text)) forbiddenMarker(label);
  }
}

async function boundedText(path, limit, label) {
  if (!path) throw new Error(`${label} is missing`);
  const chunks = [];
  let length = 0;
  for await (const chunk of createReadStream(path)) {
    length += chunk.length;
    if (length > limit) throw new Error(`${label} exceeds its bounded textual size`);
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks, length);
  if (bytes.length === 0 || bytes.length > limit) throw new Error(`${label} exceeds its bounded textual size`);
  if (bytes.includes(0)) throw new Error(`${label} is not a textual surface`);
  return bytes.toString("utf8");
}

async function scanFile(path, limit, label) {
  if (!path) throw new Error(`${label} is missing`);
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size === 0 || metadata.size > limit) {
    throw new Error(`${label} exceeds its bounded publishable-file size`);
  }
  await scanReadable(createReadStream(path), label, limit);
}

async function scanTar(path, label, release) {
  const entries = listTar(path, release.metadataLimitBytes);
  if (entries.length === 0 || entries.length > archiveEntryLimit) {
    throw new Error(`${label} exceeds its bounded archive entry count`);
  }
  const seen = new Set();
  const aggregate = { bytes: 0, limit: release.archiveLimitBytes * 2 };
  for (const entry of entries) {
    if (entry.startsWith("-") || seen.has(entry)) {
      throw new Error(`${label} contains an invalid or duplicate archive entry`);
    }
    seen.add(entry);
    scanText(entry, `${label}:archive entry name`);
    await scanTarEntry(path, entry, `${label}:${entry}`, release.archiveLimitBytes, aggregate);
  }
}

function listTar(path, limit) {
  const result = spawnSync("tar", ["-tzf", path], { maxBuffer: limit + 1 });
  if (result.status !== 0 || !result.stdout || result.stdout.length > limit) {
    throw new Error(`could not inspect the bounded archive index in ${path}`);
  }
  return result.stdout.toString("utf8").split(/\r?\n/u).filter(Boolean);
}

async function scanTarEntry(path, entry, label, limit, aggregate) {
  const child = spawn("tar", ["-xOzf", path, entry], { stdio: ["ignore", "pipe", "pipe"] });
  const completion = waitForChild(child);
  const diagnostics = [];
  let diagnosticsBytes = 0;
  child.stderr.on("data", (chunk) => {
    if (diagnosticsBytes >= 64 * 1024) return;
    const bounded = chunk.subarray(0, 64 * 1024 - diagnosticsBytes);
    diagnostics.push(bounded);
    diagnosticsBytes += bounded.length;
  });
  try {
    await scanReadable(child.stdout, label, limit, aggregate);
  } catch (error) {
    child.kill("SIGKILL");
    await completion.catch(() => {});
    throw error;
  }
  const status = await completion;
  if (status !== 0) {
    const detail = Buffer.concat(diagnostics, diagnosticsBytes).toString("utf8").trim();
    throw new Error(`could not inspect archive entry ${label}${detail ? `: ${detail}` : ""}`);
  }
}

async function scanReadable(readable, label, limit, aggregate = undefined) {
  const scanner = markerScanner(label);
  let bytes = 0;
  for await (const chunk of readable) {
    bytes += chunk.length;
    if (bytes > limit) throw new Error(`${label} exceeds its bounded inspection size`);
    if (aggregate) {
      aggregate.bytes += chunk.length;
      if (aggregate.bytes > aggregate.limit) throw new Error(`${basename(label.split(":", 1)[0])} exceeds its bounded expanded archive size`);
    }
    scanner.push(chunk);
  }
  scanner.finish();
}

function markerScanner(label) {
  let buffered = "";
  return {
    push(bytes) {
      buffered += bytes.toString("latin1");
      const cutoff = buffered.length - markerOverlapBytes;
      if (cutoff <= 0) return;
      for (const marker of forbiddenMarkers) {
        const match = marker.exec(buffered);
        if (match && match.index < cutoff) forbiddenMarker(label);
      }
      buffered = buffered.slice(cutoff);
    },
    finish() {
      scanText(buffered, label);
    },
  };
}

function forbiddenMarker(label) {
  throw new Error(`${label} contains a forbidden secret or private-key marker`);
}

function waitForChild(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} must contain exactly the bounded schema fields`);
}
