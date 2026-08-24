import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadReleaseContract } from "./release-contract.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export function archiveInvocation(target, packageDirectory, outputDirectory) {
  return {
    archive: resolve(outputDirectory, target.archiveName),
    args: ["--format=ustar", "-czf", target.archiveName, "-C", packageDirectory, ...target.archiveEntries],
    options: { cwd: outputDirectory, encoding: "utf8" },
  };
}

export async function main(args) {
  const rustTarget = args[0];
  if (!rustTarget) throw new Error("Usage: node scripts/assemble-cli-archive.mjs <rust-target> [output-directory]");

  const contract = await loadReleaseContract();
  const target = contract.targets.find((candidate) => candidate.rustTarget === rustTarget);
  if (!target) throw new Error(`Unknown native target: ${rustTarget}`);
  const packageDirectory = resolve(repositoryRoot, contract.manifest.nativePackageRoot, target.packageDirectory);
  const outputDirectory = resolve(repositoryRoot, args[1] ?? "dist/cli");
  await mkdir(outputDirectory, { recursive: true });
  const { archive, args: tarArgs, options } = archiveInvocation(target, packageDirectory, outputDirectory);
  const result = spawnSync("tar", tarArgs, options);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Could not create ${archive}: ${result.stderr}`);
  console.log(`assembled ${archive}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) await main(process.argv.slice(2));
