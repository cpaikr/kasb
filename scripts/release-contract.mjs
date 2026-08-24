import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function loadReleaseContract() {
  const cargo = await readFile(resolve(repositoryRoot, "Cargo.toml"), "utf8");
  const workspacePackage = cargo.match(/^\[workspace\.package\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/mu)?.[1];
  const version = workspacePackage?.match(/^version\s*=\s*"([^"]+)"\s*$/mu)?.[1];
  if (!version) throw new Error("Cargo workspace package version is missing.");
  const manifest = JSON.parse(await readFile(resolve(repositoryRoot, "native-targets.json"), "utf8"));
  validateReleasePolicy(manifest.release);
  if (!Array.isArray(manifest.targets)) throw new Error("native-targets.json targets must be an array.");
  return {
    version,
    manifest,
    release: manifest.release,
    targets: manifest.targets.map((target) => deriveTarget(manifest.release, version, target)),
  };
}

function validateReleasePolicy(release) {
  if (!release || typeof release !== "object" || Array.isArray(release)) {
    throw new Error("native-targets.json is missing release policy.");
  }
  for (const field of [
    "repository", "retiredThroughVersion", "tagPrefix", "archivePrefix", "archiveExtension", "checksumAsset",
    "shellInstallerAsset", "powershellInstallerAsset", "provenanceAsset", "candidateReceiptFile", "receiptFile",
  ]) {
    if (typeof release[field] !== "string" || release[field].length === 0) {
      throw new Error(`native-targets.json release.${field} must be a nonempty string.`);
    }
  }
  if (!/^\d+\.\d+\.\d+$/u.test(release.retiredThroughVersion)) {
    throw new Error("native-targets.json release.retiredThroughVersion must be stable MAJOR.MINOR.PATCH.");
  }
  if (!Array.isArray(release.archiveEntries) || release.archiveEntries.length === 0 || release.archiveEntries.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error("native-targets.json release.archiveEntries must be a nonempty string array.");
  }
  for (const field of [
    "receiptSchemaVersion", "metadataLimitBytes", "archiveLimitBytes", "requestTimeoutSeconds",
    "archiveRequestTimeoutSeconds", "transferStallTimeoutSeconds", "connectTimeoutSeconds", "redirectLimit",
  ]) {
    if (!Number.isInteger(release[field]) || release[field] <= 0) {
      throw new Error(`native-targets.json release.${field} must be a positive integer.`);
    }
  }
  if (!release.toolchain || typeof release.toolchain !== "object" || Array.isArray(release.toolchain)) {
    throw new Error("native-targets.json release.toolchain must be an object.");
  }
  for (const field of ["rust", "node", "npm"]) {
    if (typeof release.toolchain[field] !== "string" || release.toolchain[field].length === 0) {
      throw new Error(`native-targets.json release.toolchain.${field} must be a nonempty string.`);
    }
  }
}

export function deriveTarget(release, version, target) {
  const archiveName = `${release.archivePrefix}-${version}-${target.packageDirectory}.${release.archiveExtension}`;
  const archiveEntries = release.archiveEntries.map((entry) => entry === "{executable}" ? target.cliFile : entry);
  return {
    ...target,
    releaseTarget: target.packageDirectory,
    archiveName,
    archiveEntries,
    receiptFile: release.receiptFile,
    executableName: target.cliFile,
  };
}

export function releaseTag(release, version) {
  return `${release.tagPrefix}${version}`;
}

export function releaseApiUrl(release, tag) {
  return `https://api.github.com/repos/${release.repository}/releases/tags/${tag}`;
}

export function releaseDownloadUrl(release, tag, asset) {
  return `https://github.com/${release.repository}/releases/download/${tag}/${asset}`;
}

export function releaseAssetNames(contract) {
  return [
    ...contract.targets.map(({ archiveName }) => archiveName),
    contract.release.checksumAsset,
    contract.release.shellInstallerAsset,
    contract.release.powershellInstallerAsset,
    contract.release.provenanceAsset,
  ];
}

export function internalCandidateAssetNames(contract) {
  return [contract.release.candidateReceiptFile];
}

export function checksummedReleaseAssetNames(contract) {
  return releaseAssetNames(contract).filter((name) => name !== contract.release.checksumAsset);
}

export function candidateAssetDirectory(contract, name) {
  if (name === contract.release.shellInstallerAsset || name === contract.release.powershellInstallerAsset) return "dist/installers";
  if (name === contract.release.provenanceAsset) return "dist/provenance";
  return "dist/cli";
}

export function compareStableVersions(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return Math.sign(a[index] - b[index]);
  }
  return 0;
}

export function highestStableVersion(values) {
  let highest = null;
  for (const value of values) {
    if (typeof value !== "string" || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(value)) continue;
    if (highest === null || compareStableVersions(value, highest) > 0) highest = value;
  }
  return highest;
}
