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
  if (!manifest.release) throw new Error("native-targets.json is missing release policy.");
  return {
    version,
    manifest,
    release: manifest.release,
    targets: manifest.targets.map((target) => deriveTarget(manifest.release, version, target)),
  };
}

export function deriveTarget(release, version, target) {
  const archiveName = `${release.archivePrefix}-${version}-${target.packageDirectory}.${release.archiveExtension}`;
  return {
    ...target,
    releaseTarget: target.packageDirectory,
    archiveName,
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
