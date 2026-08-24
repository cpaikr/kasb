import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { candidateAssetDirectory, checksummedReleaseAssetNames, loadReleaseContract, repositoryRoot } from "./release-contract.mjs";

const contract = await loadReleaseContract();
const inputs = process.argv.slice(2);
const ciOnly = removeFlag(inputs, "--ci");
const candidate = removeFlag(inputs, "--candidate");
if (ciOnly && candidate) throw new Error("--ci and --candidate are mutually exclusive");
if (inputs.some((input) => input.startsWith("--")) || inputs.length > 1) throw new Error("unknown checksum writer option");
if (candidate && inputs.length !== 0) throw new Error("--candidate does not accept a positional output directory");
const directory = resolve(repositoryRoot, inputs[0] ?? "dist/cli");
const targets = ciOnly
  ? contract.targets.filter(({ continuousIntegration }) => continuousIntegration === true)
  : contract.targets;
const lines = [];
const names = candidate ? checksummedReleaseAssetNames(contract) : targets.map(({ archiveName }) => archiveName);
for (const name of names) {
  const path = candidate
    ? resolve(repositoryRoot, candidateAssetDirectory(contract, name), name)
    : resolve(directory, name);
  const bytes = await readFile(path);
  lines.push(`${createHash("sha256").update(bytes).digest("hex")}  ${name}`);
}
await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, contract.release.checksumAsset), `${lines.join("\n")}\n`);
console.log(`wrote ${contract.release.checksumAsset} for ${candidate ? "publishable candidate asset" : ciOnly ? "continuous-CI target" : "complete target"} set (${lines.length} entries)`);

function removeFlag(inputs, flag) {
  const index = inputs.indexOf(flag);
  if (index === -1) return false;
  inputs.splice(index, 1);
  return true;
}
