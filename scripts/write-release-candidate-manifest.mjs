import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { candidateAssetDirectory, loadReleaseContract, releaseAssetNames, repositoryRoot } from "./release-contract.mjs";
import { requiredCandidateGates } from "./release-candidate-contract.mjs";

const { sha, output } = parseArgs(process.argv.slice(2));
if (!/^[0-9a-f]{40}$/u.test(sha)) throw new Error("--sha must be a full lowercase Git commit ID");

const contract = await loadReleaseContract();
const rootPackage = JSON.parse(await readFile(resolve(repositoryRoot, contract.manifest.rootPackage, "package.json"), "utf8"));
const nativeFiles = await matchingFiles("dist/native", (name) => name.endsWith(".tgz"));
const rootFiles = await matchingFiles("dist/root", (name) => name.endsWith(".tgz"));
if (nativeFiles.length !== contract.targets.length) throw new Error(`expected ${contract.targets.length} native npm tarballs, found ${nativeFiles.length}`);
if (rootFiles.length !== 1) throw new Error(`expected one root npm tarball, found ${rootFiles.length}`);
await assertDirectoryFiles("dist/native", nativeFiles.map((file) => basename(file)));
await assertDirectoryFiles("dist/root", rootFiles.map((file) => basename(file)));

const npmPackages = [];
for (const file of [...nativeFiles, ...rootFiles]) {
  const pkg = packageJson(file);
  const role = pkg.name === rootPackage.name ? "root" : "native";
  npmPackages.push(await fileIdentity(file, { name: pkg.name, version: pkg.version, role }));
}

const githubNames = releaseAssetNames(contract);
await assertDirectoryFiles("dist/cli", [...contract.targets.map(({ archiveName }) => archiveName), contract.release.checksumAsset]);
await assertDirectoryFiles("dist/installers", [contract.release.shellInstallerAsset, contract.release.powershellInstallerAsset]);
await assertDirectoryFiles("dist/provenance", [contract.release.provenanceAsset], ["fragments"]);
await assertDirectoryFiles("dist/provenance/fragments", contract.targets.map(({ rustTarget }) => `${rustTarget}.json`));
const githubAssets = [];
for (const name of githubNames) {
  const directory = candidateAssetDirectory(contract, name);
  githubAssets.push(await fileIdentity(resolve(repositoryRoot, directory, name), { name }));
}

const manifest = {
  schemaVersion: 1,
  repository: contract.release.repository,
  version: contract.version,
  commit: sha,
  targets: contract.targets.map(({ releaseTarget }) => releaseTarget),
  gates: Object.fromEntries(requiredCandidateGates.map((gate) => [gate, true])),
  githubAssets,
  npmPackages,
};
const destination = resolve(repositoryRoot, output);
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote canonical release artifact manifest to ${output}`);

function parseArgs(args) {
  let sha;
  let output = "dist/release/artifact-manifest.json";
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value) throw new Error(`${flag ?? "candidate manifest option"} requires a value`);
    if (flag === "--sha") sha = value;
    else if (flag === "--output") output = value;
    else throw new Error(`unknown candidate manifest option ${flag}`);
  }
  if (!sha) throw new Error("--sha is required");
  return { sha, output };
}

async function matchingFiles(directory, predicate) {
  const absolute = resolve(repositoryRoot, directory);
  return (await readdir(absolute, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && predicate(entry.name))
    .map((entry) => resolve(absolute, entry.name))
    .sort();
}

async function assertDirectoryFiles(directory, expected, allowedDirectories = []) {
  const entries = await readdir(resolve(repositoryRoot, directory), { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map(({ name }) => name).sort();
  const directories = entries.filter((entry) => entry.isDirectory()).map(({ name }) => name).sort();
  const unsupported = entries.filter((entry) => !entry.isFile() && !entry.isDirectory());
  if (unsupported.length !== 0 || JSON.stringify(files) !== JSON.stringify([...expected].sort()) || JSON.stringify(directories) !== JSON.stringify([...allowedDirectories].sort())) {
    throw new Error(`${directory} must contain exactly the canonical candidate file set`);
  }
}

async function fileIdentity(file, fields) {
  const bytes = await readFile(file);
  return {
    ...fields,
    file: relative(repositoryRoot, file).split("\\").join("/"),
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function packageJson(tarball) {
  const result = spawnSync("tar", ["-xOf", tarball, "package/package.json"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`could not read package.json from ${tarball}: ${result.stderr.trim()}`);
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`could not parse package.json from ${tarball}: ${error.message}`);
  }
}
