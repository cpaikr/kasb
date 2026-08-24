import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadReleaseContract } from "./release-contract.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const rustTarget = process.argv[2];
if (!rustTarget) throw new Error("Usage: node scripts/assemble-cli-archive.mjs <rust-target> [output-directory]");

const contract = await loadReleaseContract();
const { manifest } = contract;
const target = contract.targets.find((candidate) => candidate.rustTarget === rustTarget);
if (!target) throw new Error(`Unknown native target: ${rustTarget}`);
const packageDirectory = resolve(repositoryRoot, manifest.nativePackageRoot, target.packageDirectory);
const outputDirectory = resolve(repositoryRoot, process.argv[3] ?? "dist/cli");
await mkdir(outputDirectory, { recursive: true });
const archive = resolve(outputDirectory, target.archiveName);
const result = spawnSync("tar", ["--format=ustar", "-czf", target.archiveName, "-C", packageDirectory, ...target.archiveEntries], {
  cwd: outputDirectory,
  encoding: "utf8",
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Could not create ${archive}: ${result.stderr}`);
console.log(`assembled ${archive}`);
