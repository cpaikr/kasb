import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const rustTarget = process.argv[2];
if (!rustTarget) throw new Error("Usage: node scripts/assemble-cli-archive.mjs <rust-target> [output-directory]");

const manifest = JSON.parse(await readFile(resolve(repositoryRoot, "native-targets.json"), "utf8"));
const target = manifest.targets.find((candidate) => candidate.rustTarget === rustTarget);
if (!target) throw new Error(`Unknown native target: ${rustTarget}`);
const packageDirectory = resolve(repositoryRoot, manifest.nativePackageRoot, target.packageDirectory);
const packageJson = JSON.parse(await readFile(resolve(packageDirectory, "package.json"), "utf8"));
const outputDirectory = resolve(repositoryRoot, process.argv[3] ?? "dist/cli");
await mkdir(outputDirectory, { recursive: true });
const archive = resolve(outputDirectory, `kasb-${packageJson.version}-${target.packageDirectory}.tar.gz`);
const entries = [target.cliFile, "LICENSE.md", "README.md", "THIRD_PARTY_LICENSES.html"];
const result = spawnSync("tar", ["-czf", archive, ...entries], {
  cwd: packageDirectory,
  encoding: "utf8",
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Could not create ${archive}: ${result.stderr}`);
console.log(`assembled ${archive}`);
