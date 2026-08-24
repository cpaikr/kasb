import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { loadReleaseContract, repositoryRoot } from "./release-contract.mjs";

const forbiddenMarkers = Object.freeze([
  /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/u,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/u,
  /\bnpm_[A-Za-z0-9]{20,}\b/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
]);

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

export async function scanCandidateText({ githubAssets, npmPackages }, root = repositoryRoot) {
  const contract = await loadReleaseContract();
  const byName = new Map(githubAssets.map((asset) => [asset.name, resolve(root, asset.file)]));
  for (const name of [
    contract.release.checksumAsset,
    contract.release.shellInstallerAsset,
    contract.release.powershellInstallerAsset,
    contract.release.provenanceAsset,
  ]) {
    scanText(await boundedText(byName.get(name), contract.release.metadataLimitBytes, name), name);
  }
  for (const target of contract.targets) {
    const archive = byName.get(target.archiveName);
    for (const entry of target.archiveEntries.filter((name) => name !== target.cliFile)) {
      scanText(tarEntry(archive, entry, true, contract.release.metadataLimitBytes), `${target.archiveName}:${entry}`);
    }
  }
  for (const pkg of npmPackages) {
    const tarball = resolve(root, pkg.file);
    const entries = listTar(tarball);
    for (const entry of entries.filter(isKnownTextEntry)) {
      scanText(tarEntry(tarball, entry, false, contract.release.metadataLimitBytes), `${basename(tarball)}:${entry}`);
    }
  }
}

export function scanText(text, label) {
  for (const marker of forbiddenMarkers) {
    if (marker.test(text)) throw new Error(`${label} contains a forbidden secret or private-key marker`);
  }
}

function isKnownTextEntry(entry) {
  return /(?:^|\/)(?:package\.json|README\.md|LICENSE\.md|THIRD_PARTY_LICENSES\.(?:md|html))$/u.test(entry)
    || /\/dist\/[^/]+\.(?:js|d\.ts|json)$/u.test(entry);
}

async function boundedText(path, limit, label) {
  if (!path) throw new Error(`${label} is missing`);
  const bytes = await readFile(path);
  if (bytes.length === 0) throw new Error(`${label} is empty`);
  if (bytes.length > limit) throw new Error(`${label} exceeds its bounded textual size`);
  if (bytes.includes(0)) throw new Error(`${label} is not a textual surface`);
  return bytes.toString("utf8");
}

function listTar(path) {
  const result = spawnSync("tar", ["-tzf", path], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`could not list ${path}: ${result.stderr.trim()}`);
  return result.stdout.split(/\r?\n/u).filter(Boolean);
}

function tarEntry(path, entry, gzip, limit) {
  const result = spawnSync("tar", [gzip ? "-xOzf" : "-xOf", path, entry], { maxBuffer: limit + 1 });
  if (result.status !== 0) throw new Error(`could not inspect textual entry ${entry} in ${path}`);
  if (result.stdout.length === 0 || result.stdout.length > limit || result.stdout.includes(0)) {
    if (result.stdout.length === 0) throw new Error(`${basename(path)}:${entry} is empty`);
    throw new Error(`${basename(path)}:${entry} exceeds its bounded textual size`);
  }
  return result.stdout.toString("utf8");
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} must contain exactly the bounded schema fields`);
}
