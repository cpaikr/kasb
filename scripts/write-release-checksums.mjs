import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { checksummedReleaseAssetNames, loadReleaseContract, repositoryRoot } from "./release-contract.mjs";

const contract = await loadReleaseContract();
const inputs = process.argv.slice(2);
const ciOnly = inputs[0] === "--ci";
if (ciOnly) inputs.shift();
const candidate = inputs[0] === "--candidate";
if (candidate) inputs.shift();
if (ciOnly && candidate) throw new Error("--ci and --candidate are mutually exclusive");
const directory = resolve(repositoryRoot, inputs[0] ?? "dist/cli");
const targets = ciOnly
  ? contract.targets.filter(({ continuousIntegration }) => continuousIntegration === true)
  : contract.targets;
const lines = [];
const names = candidate ? checksummedReleaseAssetNames(contract) : targets.map(({ archiveName }) => archiveName);
for (const name of names) {
  const path = candidate
    ? resolve(repositoryRoot, candidateDirectory(name), name)
    : resolve(directory, name);
  const bytes = await readFile(path);
  lines.push(`${createHash("sha256").update(bytes).digest("hex")}  ${name}`);
}
await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, contract.release.checksumAsset), `${lines.join("\n")}\n`);
console.log(`wrote ${contract.release.checksumAsset} for ${candidate ? "publishable candidate asset" : ciOnly ? "continuous-CI target" : "complete target"} set (${lines.length} entries)`);

function candidateDirectory(name) {
  if (name === contract.release.shellInstallerAsset || name === contract.release.powershellInstallerAsset) return "dist/installers";
  if (name === contract.release.provenanceAsset) return "dist/provenance";
  return "dist/cli";
}
