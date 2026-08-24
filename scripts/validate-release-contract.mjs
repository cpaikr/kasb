import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadReleaseContract, releaseAssetNames, releaseDownloadUrl, releaseTag, repositoryRoot } from "./release-contract.mjs";

const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const contract = await loadReleaseContract();
validateCanonicalReleaseMatrix(contract);
if (process.argv.includes("--release-matrix-only")) {
  finish(`release matrix is canonical for ${contract.targets.length} targets`);
  process.exit(0);
}
const metadata = command("cargo", ["metadata", "--locked", "--no-deps", "--format-version", "1"]);
if (metadata.status === 0) {
  const packages = JSON.parse(metadata.stdout).packages.filter(({ source }) => source === null);
  for (const pkg of packages) {
    check(pkg.version === contract.version, `${pkg.name} version ${pkg.version} differs from Cargo workspace ${contract.version}`);
    for (const dependency of pkg.dependencies.filter((candidate) => candidate.path && candidate.req !== "*" && packages.some(({ name }) => name === candidate.name))) {
      check(dependency.req === `^${contract.version}`, `${pkg.name} dependency ${dependency.name} requirement ${dependency.req} differs from Cargo workspace ${contract.version}`);
    }
  }
} else failures.push(`cargo metadata failed: ${metadata.stderr.trim()}`);

const root = JSON.parse(await readFile(resolve(repositoryRoot, contract.manifest.rootPackage, "package.json"), "utf8"));
check(root.version === contract.version, `root npm version ${root.version} differs from Cargo workspace ${contract.version}`);
const expectedOptional = Object.fromEntries(contract.targets.map((target) => [target.packageName, contract.version]));
check(JSON.stringify(root.optionalDependencies) === JSON.stringify(expectedOptional), "root optional dependency versions are not exact Cargo-derived identities");
const bunLockText = await readFile(resolve(repositoryRoot, "bun.lock"), "utf8");
const bunLock = JSON.parse(bunLockText.replace(/,\s*([}\]])/gu, "$1"));
check(bunLock.workspaces?.[contract.manifest.rootPackage]?.version === contract.version, "bun.lock root workspace version differs from Cargo workspace");
check(sameEntries(bunLock.workspaces?.[contract.manifest.rootPackage]?.optionalDependencies, expectedOptional), "bun.lock root optional dependency versions differ from Cargo workspace");

const targetKeys = new Set();
const assets = new Set();
for (const target of contract.targets) {
  const key = `${target.npmPlatform}:${target.npmArch}:${target.libc ?? ""}`;
  check(!targetKeys.has(key), `duplicate installer target identity ${key}`);
  targetKeys.add(key);
  check(!assets.has(target.archiveName), `duplicate standalone archive ${target.archiveName}`);
  assets.add(target.archiveName);
  const pkg = JSON.parse(await readFile(resolve(repositoryRoot, contract.manifest.nativePackageRoot, target.packageDirectory, "package.json"), "utf8"));
  check(pkg.version === contract.version, `${target.packageName} version ${pkg.version} differs from Cargo workspace ${contract.version}`);
  check(pkg.name === target.packageName, `${target.rustTarget} package identity drifted`);
  check(pkg.files?.includes(target.executableName), `${target.packageName} does not carry ${target.executableName}`);
  const workspacePath = `${contract.manifest.nativePackageRoot}/${target.packageDirectory}`;
  check(bunLock.workspaces?.[workspacePath]?.version === contract.version, `bun.lock ${target.packageName} version differs from Cargo workspace`);
}
check(contract.targets.length === 4, "release identity must cover all four supported targets exactly");
check(contract.release.repository === "cpaikr/kasb", "release repository identity must remain cpaikr/kasb");
check(contract.release.shellInstallerAsset === "install.sh", "shell installer release identity must remain install.sh");
check(contract.release.powershellInstallerAsset === "install.ps1", "PowerShell installer release identity must remain install.ps1");
check(contract.release.provenanceAsset === "provenance.json", "release provenance identity must remain provenance.json");
check(contract.release.receiptSchemaVersion === 1, "receipt schema version must remain explicit");
check(contract.release.receiptFile === ".kasb-receipt.json", "receipt filename must remain stable");
check(contract.release.candidateReceiptFile === "candidate.json", "candidate receipt filename must remain stable");
const expectedToolchain = { rust: "1.88.0", node: "24", npm: "11.6.2" };
const toolchain = contract.release.toolchain ?? {};
check(JSON.stringify(Object.keys(toolchain).sort()) === JSON.stringify(Object.keys(expectedToolchain).sort()), "release toolchain must contain exactly rust, node, and npm pins");
for (const [name, version] of Object.entries(expectedToolchain)) {
  check(toolchain[name] === version, `release ${name} toolchain pin must remain ${version}`);
}
for (const target of contract.targets) {
  check(typeof target.releaseRunner === "string" && target.releaseRunner.length > 0, `${target.rustTarget} is missing a release runner`);
}
check(
  JSON.stringify(contract.release.archiveEntries) === JSON.stringify(["{executable}", "LICENSE.md", "README.md", "THIRD_PARTY_LICENSES.html"]),
  "standalone archive entries must remain one exact shared release contract",
);
check(new Set(contract.release.archiveEntries).size === contract.release.archiveEntries.length, "standalone archive entries must be unique");
check(contract.release.archiveRequestTimeoutSeconds > contract.release.requestTimeoutSeconds, "archive downloads need a distinct longer transfer timeout");
check(contract.release.transferStallTimeoutSeconds > 0, "release downloads need a positive stall timeout");

for (const installer of ["installers/install.sh", "installers/install.ps1"]) {
  const text = await readFile(resolve(repositoryRoot, installer), "utf8");
  check(text.includes(contract.version), `${installer} lacks Cargo-derived version`);
  check(text.includes(contract.release.repository), `${installer} lacks canonical repository`);
  const selectedTargets = installer.endsWith(".sh")
    ? contract.targets.filter(({ npmPlatform }) => npmPlatform !== "win32")
    : contract.targets;
  for (const target of selectedTargets) check(text.includes(target.archiveName), `${installer} lacks ${target.archiveName}`);
}
const generatorCheck = command("node", ["scripts/generate-release-assets.mjs", "--check"]);
if (generatorCheck.status !== 0) failures.push(generatorCheck.stderr.trim() || generatorCheck.stdout.trim());
const nativeCheck = command("node", ["scripts/generate-native-packages.mjs", "--check"]);
if (nativeCheck.status !== 0) failures.push(nativeCheck.stderr.trim() || nativeCheck.stdout.trim());
const shellSyntax = command("sh", ["-n", "installers/install.sh"]);
if (shellSyntax.status !== 0) failures.push(`installers/install.sh syntax: ${shellSyntax.stderr.trim()}`);

const binary = command("cargo", ["run", "--quiet", "--locked", "-p", "kasb-cli", "--bin", "kasb", "--", "--version"]);
if (binary.status === 0) check(binary.stdout.trim() === `kasb ${contract.version}`, `CLI reported ${JSON.stringify(binary.stdout.trim())}`);
else failures.push(`could not validate CLI version: ${binary.stderr.trim()}`);

if (process.env.GITHUB_REF_TYPE === "tag") {
  check(process.env.GITHUB_REF_NAME === releaseTag(contract.release, contract.version), `tag ${process.env.GITHUB_REF_NAME} differs from canonical ${releaseTag(contract.release, contract.version)}`);
}
if (process.env.KASB_RELEASE_METADATA) {
  const release = JSON.parse(await readFile(process.env.KASB_RELEASE_METADATA, "utf8"));
  failures.push(...releaseMetadataFailures(release, contract));
}

const expectedMetadataAssets = releaseAssetNames(contract);
const validMetadataFixture = {
  immutable: true,
  draft: false,
  prerelease: false,
  tag_name: releaseTag(contract.release, contract.version),
  assets: expectedMetadataAssets.map((name) => ({
    name,
    size: 1,
    browser_download_url: releaseDownloadUrl(contract.release, releaseTag(contract.release, contract.version), name),
  })),
};
if (releaseMetadataFailures(validMetadataFixture, contract).length !== 0) failures.push("release metadata validator rejected its canonical self-test fixture");
if (!releaseMetadataFailures({ ...validMetadataFixture, assets: [...validMetadataFixture.assets, { name: "unexpected", size: 1 }] }, contract)
  .includes("release metadata must contain exactly the canonical standalone asset-name set")) {
  failures.push("release metadata validator accepted an unexpected-asset self-test fixture");
}

finish(`release contract is current for kasb ${contract.version} and ${contract.targets.length} targets`);

function command(executable, args) {
  return spawnSync(executable, args, { cwd: repositoryRoot, encoding: "utf8" });
}

function sameEntries(left, right) {
  return JSON.stringify(Object.entries(left ?? {}).sort()) === JSON.stringify(Object.entries(right).sort());
}

function validateCanonicalReleaseMatrix(releaseContract) {
  const expected = [
    {
      rustTarget: "x86_64-unknown-linux-gnu",
      packageDirectory: "linux-x64-gnu",
      releaseRunner: "blacksmith-2vcpu-ubuntu-2404",
      buildContainer: "quay.io/pypa/manylinux_2_28_x86_64:2026.08.15-1@sha256:0c87ccb5996dab6c3b7612ee4fda7b80c4ab3c44a86c2541e4a872afdf4f131b",
    },
    {
      rustTarget: "aarch64-unknown-linux-gnu",
      packageDirectory: "linux-arm64-gnu",
      releaseRunner: "blacksmith-2vcpu-ubuntu-2404-arm",
      buildContainer: "quay.io/pypa/manylinux_2_28_aarch64:2026.08.15-1@sha256:561427136aabf3787bffb294b3515748241e0962d1527ae28bea1e076bfb9d99",
    },
    {
      rustTarget: "aarch64-apple-darwin",
      packageDirectory: "darwin-arm64",
      releaseRunner: "macos-15",
      buildContainer: null,
    },
    {
      rustTarget: "x86_64-pc-windows-msvc",
      packageDirectory: "win32-x64-msvc",
      releaseRunner: "windows-2025",
      buildContainer: null,
    },
  ];
  const actual = releaseContract.targets.map(({ rustTarget, packageDirectory, releaseRunner, buildContainer = null }) => ({
    rustTarget,
    packageDirectory,
    releaseRunner,
    buildContainer,
  }));
  check(JSON.stringify(actual) === JSON.stringify(expected), "release targets, package directories, runners, and build containers must match the exact canonical matrix");
  check(
    JSON.stringify(releaseContract.manifest.validationNodeVersions) === JSON.stringify(["20.18.1", "21", "22", "23", "24", "25", "26"]),
    "clean-consumer Node coverage must remain exactly 20.18.1 and majors 21 through 26",
  );
}

function finish(message) {
  if (failures.length) {
    console.error(failures.map((failure) => `- ${failure}`).join("\n"));
    process.exit(1);
  }
  console.log(message);
}

function releaseMetadataFailures(release, releaseContract) {
  const metadataFailures = [];
  const requireMetadata = (condition, message) => { if (!condition) metadataFailures.push(message); };
  requireMetadata(release.immutable === true, "release metadata must be immutable");
  requireMetadata(release.draft === false && release.prerelease === false, "release metadata must describe a production release");
  requireMetadata(release.tag_name === releaseTag(releaseContract.release, releaseContract.version), "release metadata tag differs from canonical version");
  const expectedAssets = releaseAssetNames(releaseContract);
  const actualAssets = (release.assets ?? []).map(({ name }) => name);
  requireMetadata(
    JSON.stringify([...actualAssets].sort()) === JSON.stringify([...expectedAssets].sort()),
    "release metadata must contain exactly the canonical standalone asset-name set",
  );
  for (const expected of expectedAssets) {
    const matches = (release.assets ?? []).filter(({ name }) => name === expected);
    requireMetadata(matches.length === 1, `release metadata must contain exactly one ${expected}`);
    const [asset] = matches;
    if (!asset) continue;
    const limit = releaseContract.targets.some(({ archiveName }) => archiveName === expected)
      ? releaseContract.release.archiveLimitBytes
      : releaseContract.release.metadataLimitBytes;
    requireMetadata(Number.isSafeInteger(asset.size) && asset.size > 0 && asset.size <= limit, `${expected} metadata has an invalid bounded size`);
    requireMetadata(asset.browser_download_url === releaseDownloadUrl(releaseContract.release, release.tag_name, expected), `${expected} metadata has a noncanonical download URL`);
  }
  return metadataFailures;
}
