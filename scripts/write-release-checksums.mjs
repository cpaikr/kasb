import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadReleaseContract, repositoryRoot } from "./release-contract.mjs";

const contract = await loadReleaseContract();
const inputs = process.argv.slice(2);
const ciOnly = inputs[0] === "--ci";
if (ciOnly) inputs.shift();
const directory = resolve(repositoryRoot, inputs[0] ?? "dist/cli");
const targets = ciOnly
  ? contract.targets.filter(({ continuousIntegration }) => continuousIntegration === true)
  : contract.targets;
const lines = [];
for (const target of targets) {
  const bytes = await readFile(resolve(directory, target.archiveName));
  lines.push(`${createHash("sha256").update(bytes).digest("hex")}  ${target.archiveName}`);
}
await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, contract.release.checksumAsset), `${lines.join("\n")}\n`);
console.log(`wrote ${contract.release.checksumAsset} for ${ciOnly ? "continuous-CI" : "complete"} ${lines.length}-target set`);
