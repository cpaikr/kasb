import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { checksummedReleaseAssetNames, loadReleaseContract, repositoryRoot } from "./release-contract.mjs";

const inputs = process.argv.slice(2);
const ciOnly = inputs[0] === "--ci";
if (ciOnly) inputs.shift();
const candidate = inputs[0] === "--candidate";
if (candidate) inputs.shift();
if (ciOnly && candidate) throw new Error("--ci and --candidate are mutually exclusive.");
const nativeDirectory = resolve(repositoryRoot, inputs[0] ?? "dist/native");
const rootDirectory = resolve(repositoryRoot, inputs[1] ?? "dist/root");
const cliDirectory = resolve(repositoryRoot, inputs[2] ?? "dist/cli");
const contract = await loadReleaseContract();
const { manifest } = contract;
const rootSource = JSON.parse(await readFile(resolve(repositoryRoot, manifest.rootPackage, "package.json"), "utf8"));
const license = await readFile(resolve(repositoryRoot, "LICENSE.md"), "utf8");
const notices = await readFile(resolve(repositoryRoot, "THIRD_PARTY_LICENSES.html"), "utf8");
const nodeNotices = await readFile(resolve(repositoryRoot, manifest.rootPackage, "THIRD_PARTY_LICENSES.md"), "utf8");
const validatedTargets = ciOnly
  ? contract.targets.filter(({ continuousIntegration }) => continuousIntegration === true)
  : contract.targets;
const expectedNative = new Map(validatedTargets.map((target) => [target.packageName, target]));

assertPublicPackage(rootSource, "@sjunepark/kasb");
assertNoPiMetadata(rootSource);

const nativeTarballs = await tarballs(nativeDirectory);
const rootTarballs = await tarballs(rootDirectory);
const cliArchives = await archives(cliDirectory);
const checksumManifest = await readFile(resolve(cliDirectory, manifest.release.checksumAsset), "utf8");
const checksums = new Map();
for (const line of checksumManifest.trimEnd().split(/\r?\n/u)) {
  const match = line.match(/^([0-9a-f]{64})  ([^/\\]+)$/u);
  if (!match || checksums.has(match[2])) throw new Error(`Invalid or duplicate checksum entry ${JSON.stringify(line)}.`);
  checksums.set(match[2], match[1]);
}
if (nativeTarballs.length !== expectedNative.size) {
  throw new Error(`Expected ${expectedNative.size} native tarballs, found ${nativeTarballs.length}.`);
}
if (rootTarballs.length !== 1) throw new Error(`Expected one root tarball, found ${rootTarballs.length}.`);
if (cliArchives.length !== expectedNative.size) {
  throw new Error(`Expected ${expectedNative.size} direct CLI archives, found ${cliArchives.length}.`);
}
const expectedChecksums = candidate
  ? checksummedReleaseAssetNames(contract)
  : validatedTargets.map(({ archiveName }) => archiveName);
if (JSON.stringify([...checksums.keys()].sort()) !== JSON.stringify([...expectedChecksums].sort())) {
  throw new Error(`Expected the exact ${candidate ? "publishable candidate asset" : "standalone archive"} checksum set.`);
}
if (candidate) {
  for (const name of [manifest.release.shellInstallerAsset, manifest.release.powershellInstallerAsset]) {
    const bytes = await readFile(resolve(repositoryRoot, "dist/installers", name));
    if (checksums.get(name) !== hash(bytes)) throw new Error(`${name} checksum differs from ${manifest.release.checksumAsset}.`);
  }
  const provenance = await readFile(resolve(repositoryRoot, "dist/provenance", manifest.release.provenanceAsset));
  if (checksums.get(manifest.release.provenanceAsset) !== hash(provenance)) {
    throw new Error(`${manifest.release.provenanceAsset} checksum differs from ${manifest.release.checksumAsset}.`);
  }
}

const seen = new Set();
for (const tarball of nativeTarballs) {
  const pkg = packageJson(tarball);
  const target = expectedNative.get(pkg.name);
  if (!target) throw new Error(`Unexpected native package ${pkg.name}.`);
  assertPublicPackage(pkg, target.packageName);
  if (seen.has(pkg.name)) throw new Error(`Duplicate native package ${pkg.name}.`);
  seen.add(pkg.name);
  if (pkg.version !== rootSource.version) throw new Error(`${pkg.name} has version skew.`);
  if (pkg.main !== target.addonFile) throw new Error(`${pkg.name} has the wrong addon entrypoint.`);
  if (JSON.stringify(pkg.os) !== JSON.stringify([target.npmPlatform])) throw new Error(`${pkg.name} has the wrong os constraint.`);
  if (JSON.stringify(pkg.cpu) !== JSON.stringify([target.npmArch])) throw new Error(`${pkg.name} has the wrong cpu constraint.`);
  if (target.libc && JSON.stringify(pkg.libc) !== JSON.stringify([target.libc])) throw new Error(`${pkg.name} has the wrong libc constraint.`);
  const entries = listTarball(tarball);
  const expectedNativeEntries = [
    "package/LICENSE.md",
    "package/README.md",
    "package/THIRD_PARTY_LICENSES.html",
    `package/${target.addonFile}`,
    `package/${target.cliFile}`,
    "package/package.json",
  ].sort();
  if (JSON.stringify([...entries].sort()) !== JSON.stringify(expectedNativeEntries)) {
    throw new Error(`${pkg.name} has unexpected package contents.`);
  }
  const nativeEntries = entries.filter((entry) => entry.endsWith(".node"));
  if (JSON.stringify(nativeEntries) !== JSON.stringify([`package/${target.addonFile}`])) {
    throw new Error(`${pkg.name} must contain exactly one declared addon.`);
  }
  if (!entries.includes(`package/${target.cliFile}`)) throw new Error(`${pkg.name} is missing the Rust CLI.`);
  if (tarballEntry(tarball, "package/LICENSE.md") !== license) throw new Error(`${pkg.name} has a stale license.`);
  if (tarballEntry(tarball, "package/THIRD_PARTY_LICENSES.html") !== notices) throw new Error(`${pkg.name} has stale notices.`);

  const expectedArchiveName = target.archiveName;
  const cliArchive = cliArchives.find((candidate) => basename(candidate) === expectedArchiveName);
  if (!cliArchive) throw new Error(`${pkg.name} is missing its direct CLI archive.`);
  if (checksums.get(expectedArchiveName) !== hash(await readFile(cliArchive))) {
    throw new Error(`${pkg.name} direct CLI archive checksum differs from ${manifest.release.checksumAsset}.`);
  }
  const cliEntries = listArchive(cliArchive).sort();
  const expectedEntries = [...target.archiveEntries].sort();
  if (JSON.stringify(cliEntries) !== JSON.stringify(expectedEntries)) {
    throw new Error(`${pkg.name} direct CLI archive has unexpected contents.`);
  }
  if (hash(archiveEntry(cliArchive, target.cliFile)) !== hash(tarballEntryBuffer(tarball, `package/${target.cliFile}`))) {
    throw new Error(`${pkg.name} direct archive and npm package do not contain the same CLI binary.`);
  }
  if (archiveEntry(cliArchive, "LICENSE.md").toString("utf8") !== license) {
    throw new Error(`${pkg.name} direct CLI archive has a stale license.`);
  }
  if (archiveEntry(cliArchive, "THIRD_PARTY_LICENSES.html").toString("utf8") !== notices) {
    throw new Error(`${pkg.name} direct CLI archive has stale notices.`);
  }
  assertNoInstallHooks(pkg, pkg.name);
  if (target.npmPlatform !== "win32" && !isExecutableMode(tarballMode(tarball, `package/${target.cliFile}`))) {
    throw new Error(`${pkg.name} CLI is not executable in the npm tarball.`);
  }
}

const rootTarball = rootTarballs[0];
const root = packageJson(rootTarball);
assertPublicPackage(root, "@sjunepark/kasb");
assertNoPiMetadata(root);
if (root.version !== rootSource.version) throw new Error("Root package identity drifted.");
const expectedOptional = Object.fromEntries(manifest.targets.map((target) => [target.packageName, rootSource.version]));
if (JSON.stringify(root.optionalDependencies) !== JSON.stringify(expectedOptional)) throw new Error("Root optional dependencies drifted.");
const rootEntries = listTarball(rootTarball);
const expectedRootEntries = [
  "package/LICENSE.md",
  "package/README.md",
  "package/THIRD_PARTY_LICENSES.md",
  "package/dist/cli.js",
  "package/dist/error.js",
  "package/dist/index.d.ts",
  "package/dist/index.js",
  "package/dist/native-targets.json",
  "package/dist/native.d.ts",
  "package/dist/native.js",
  "package/dist/runtime-target.js",
  "package/dist/target.js",
  "package/dist/toolset.d.ts",
  "package/dist/toolset.js",
  "package/package.json",
].sort();
if (JSON.stringify([...rootEntries].sort()) !== JSON.stringify(expectedRootEntries)) {
  throw new Error("Root package has unexpected package contents.");
}
if (tarballEntry(rootTarball, "package/LICENSE.md") !== license) throw new Error("Root package has a stale license.");
if (tarballEntry(rootTarball, "package/THIRD_PARTY_LICENSES.md") !== nodeNotices) {
  throw new Error("Root package has stale bundled Node notices.");
}
assertNoInstallHooks(root, root.name);
if (!isExecutableMode(tarballMode(rootTarball, "package/dist/cli.js"))) {
  throw new Error("Root launcher is not executable in the npm tarball.");
}

console.log(`${ciOnly ? "continuous-CI" : candidate ? "complete candidate" : "complete"} native artifact set passed for ${root.name}@${root.version}`);

async function tarballs(directory) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tgz"))
    .map((entry) => resolve(directory, entry.name))
    .sort();
}

async function archives(directory) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tar.gz"))
    .map((entry) => resolve(directory, entry.name))
    .sort();
}

function packageJson(tarball) {
  return JSON.parse(tarballEntry(tarball, "package/package.json"));
}

function tarballEntry(tarball, entry) {
  return tarballEntryBuffer(tarball, entry).toString("utf8");
}

function tarballEntryBuffer(tarball, entry) {
  const result = spawnSync("tar", ["-xOf", tarball, entry], { maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Could not read ${entry} from ${tarball}: ${result.stderr}`);
  return result.stdout;
}

function archiveEntry(archive, entry) {
  const result = spawnSync("tar", ["-xOzf", archive, entry], { maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Could not read ${entry} from ${archive}: ${result.stderr}`);
  return result.stdout;
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function listArchive(archive) {
  const result = spawnSync("tar", ["-tzf", archive], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Could not list ${archive}: ${result.stderr}`);
  return result.stdout.split(/\r?\n/u).filter(Boolean);
}

function listTarball(tarball) {
  const result = spawnSync("tar", ["-tzf", tarball], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Could not list ${tarball}: ${result.stderr}`);
  return result.stdout.split(/\r?\n/u).filter(Boolean);
}

function tarballMode(tarball, entry) {
  const result = spawnSync("tar", ["-tvzf", tarball, entry], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Could not inspect ${entry} from ${tarball}: ${result.stderr}`);
  return result.stdout.trim().split(/\s+/u)[0];
}

function isExecutableMode(mode) {
  return /^-.{2}x.{2}x.{2}x$/u.test(mode);
}

function assertNoInstallHooks(pkg, name) {
  for (const hook of ["preinstall", "install", "postinstall"]) {
    if (Object.hasOwn(pkg.scripts ?? {}, hook)) throw new Error(`${name} must not define a ${hook} hook.`);
  }
}

function assertPublicPackage(pkg, expectedName) {
  if (pkg.name !== expectedName) throw new Error(`Expected public package ${expectedName}, received ${pkg.name}.`);
  if (pkg.private === true) throw new Error(`${expectedName} must not be private.`);
  if (pkg.publishConfig?.access !== "public") throw new Error(`${expectedName} must declare public scoped-package access.`);
}

function assertNoPiMetadata(pkg) {
  if (Object.hasOwn(pkg.exports ?? {}, "./pi") || Object.hasOwn(pkg, "pi")) {
    throw new Error("The canonical package must not expose Pi metadata.");
  }
}
