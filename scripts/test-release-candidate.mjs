import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { archiveInvocation } from "./assemble-cli-archive.mjs";
import { localArchivePath, localTarDestination, localTarInvocation } from "./local-archive-path.mjs";
import { canonicalCandidateIdentity, requiredCandidateGates, validateArtifactManifest, validateCandidateVersion, validatePrebuildPublicationState, validatePublicationStateSource } from "./release-candidate-contract.mjs";
import { scanCandidateText, scanText, validateCandidateProvenance } from "./release-candidate-inspection.mjs";
import { checksummedReleaseAssetNames, loadReleaseContract, releaseAssetNames, repositoryRoot } from "./release-contract.mjs";

const sha = "a".repeat(40);
const identity = await canonicalCandidateIdentity({ mode: "rehearsal", ref: `refs/kasb-rehearsal/${sha}`, sha });
const directory = await mkdtemp(join(repositoryRoot, ".release-candidate-test-"));

try {
  const contract = await loadReleaseContract();
  const windowsTarget = contract.targets.find(({ rustTarget }) => rustTarget === "x86_64-pc-windows-msvc");
  const windowsPackageDirectory = "D:\\a\\kasb\\kasb\\packages\\native\\win32-x64-msvc";
  const windowsOutputDirectory = "D:\\a\\kasb\\kasb\\dist\\cli";
  const windowsArchive = archiveInvocation(windowsTarget, windowsPackageDirectory, windowsOutputDirectory);
  assert.equal(windowsArchive.args[2], windowsTarget.archiveName, "tar archive output must not expose a Windows drive path to remote-archive parsing");
  assert.deepEqual(windowsArchive.args.slice(3, 5), ["-C", windowsPackageDirectory], "tar must read canonical entries from the native package directory");
  assert.equal(windowsArchive.options.cwd, windowsOutputDirectory, "tar must create the archive from its output directory");
  assert.deepEqual(
    localArchivePath(`${windowsOutputDirectory}\\${windowsTarget.archiveName}`),
    { directory: windowsOutputDirectory, name: windowsTarget.archiveName },
    "tar readers must keep Windows drive paths in cwd instead of archive operands",
  );
  assert.deepEqual(
    localTarInvocation(`${windowsOutputDirectory}/${windowsTarget.archiveName}`, "-tzf"),
    {
      args: ["-tzf", windowsTarget.archiveName],
      options: { cwd: windowsOutputDirectory },
    },
    "tar listing must use a local archive operand for forward-slash Windows paths",
  );
  assert.deepEqual(
    localTarInvocation(`\\\\server\\release\\${windowsTarget.archiveName}`, "-xzf", ["-C", "destination"]),
    {
      args: ["-xzf", windowsTarget.archiveName, "-C", "destination"],
      options: { cwd: "\\\\server\\release\\" },
    },
    "tar extraction must use a local archive operand for UNC paths",
  );
  assert.equal(
    localTarDestination(
      `C:\\candidate\\cli\\${windowsTarget.archiveName}`,
      "C:\\candidate\\.kasb-exact-candidate-123\\archive",
    ),
    "../.kasb-exact-candidate-123/archive",
  );

  for (const script of ["scripts/write-release-checksums.mjs", "scripts/validate-release-artifacts.mjs"]) {
    for (const flags of [["--candidate", "--ci"], ["--ci", "--candidate"]]) {
      const result = spawnSync(process.execPath, [script, ...flags], { cwd: repositoryRoot, encoding: "utf8" });
      assert.notEqual(result.status, 0, `${script} accepted mutually exclusive flags in order ${flags.join(" ")}`);
      assert.match(result.stderr, /mutually exclusive/u);
    }
  }

  const manifest = await validManifest();
  const candidate = await validateArtifactManifest(identity, manifest);
  assert.equal(candidate.phase, "artifacts");
  assert.equal(candidate.npmPackages.length, 5);
  assert.equal(candidate.githubAssets.length, 8);
  const cliManifest = join(directory, "artifact-manifest.json");
  const cliCandidate = join(directory, "candidate.json");
  await writeFile(cliManifest, `${JSON.stringify(manifest)}\n`);
  const cliValidation = spawnSync(process.execPath, [
    "scripts/validate-release-candidate.mjs",
    "--mode", identity.mode,
    "--ref", identity.sourceRef,
    "--sha", identity.commit,
    "--publication-state", "fixtures/release/publication-vacant.json",
    "--artifact-manifest", relative(repositoryRoot, cliManifest),
    "--output", relative(repositoryRoot, cliCandidate),
    "--skip-checkout-validation",
  ], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, KASB_CANDIDATE_TEST_ALLOW_SKIP_CHECKOUT: "1" },
  });
  assert.equal(cliValidation.status, 0, cliValidation.stderr);
  assert.equal(JSON.parse(await readFile(cliCandidate, "utf8")).publicationStateSource, "fixture");
  const rootedManifest = {
    ...manifest,
    githubAssets: manifest.githubAssets.map((asset) => ({
      ...asset,
      file: relative(directory, resolve(repositoryRoot, asset.file)),
    })),
    npmPackages: manifest.npmPackages.map((pkg) => ({
      ...pkg,
      file: relative(directory, resolve(repositoryRoot, pkg.file)),
    })),
  };
  const rootedPackageJson = join(directory, contract.manifest.rootPackage, "package.json");
  await mkdir(dirname(rootedPackageJson), { recursive: true });
  await writeFile(rootedPackageJson, await readFile(resolve(repositoryRoot, contract.manifest.rootPackage, "package.json")));
  assert.equal((await validateArtifactManifest(identity, rootedManifest, directory)).phase, "artifacts");
  const alternateRoot = join(directory, "alternate-root");
  await mkdir(join(alternateRoot, "assets"), { recursive: true });
  await mkdir(join(alternateRoot, "npm"), { recursive: true });
  await writeFile(join(alternateRoot, "assets", "install.sh"), "fixture installer\n");
  await npmFixture("@sjunepark/root-override", "root", undefined, join(alternateRoot, "npm", "package.tgz"));
  await scanCandidateText({
    githubAssets: [{ name: "install.sh", file: "assets/install.sh" }],
    npmPackages: [{ file: "npm/package.tgz" }],
  }, alternateRoot);
  validatePublicationStateSource("rehearsal", { schemaVersion: 1, source: "fixture" });
  validatePublicationStateSource("strict", { schemaVersion: 1, source: "live" });
  assert.throws(() => validateCandidateVersion("1.2.3-01", "rehearsal"), /stable MAJOR\.MINOR\.PATCH/u);
  assert.throws(() => validateCandidateVersion("1.2.3-..", "strict"), /stable MAJOR\.MINOR\.PATCH/u);
  assert.throws(() => validateCandidateVersion("0.2.1", "strict"), /newer than retired version/u);
  const occupied = prebuildState();
  await validatePrebuildPublicationState(identity, occupied);
  const existingRelease = {
    ...occupied,
    github: {
      ...occupied.github,
      release: {
        tag: identity.canonicalTag,
        targetSha: identity.commit,
        draft: true,
        prerelease: false,
        immutable: false,
        assets: [],
      },
    },
  };
  await assert.rejects(
    validatePrebuildPublicationState({ ...identity, mode: "strict" }, existingRelease),
    /rerun only the failed publication job/u,
  );
  await assert.rejects(
    validatePrebuildPublicationState(identity, {
      ...occupied,
      npm: { ...occupied.npm, packages: occupied.npm.packages.map((pkg, index) => index === 0 ? { ...pkg, sha256: undefined } : pkg) },
    }),
    /missing its registry tarball digest/u,
  );

  await rejectsWith({ ...manifest, targets: manifest.targets.slice(1) }, /target set must contain every canonical identity exactly once/u);
  await rejectsWith({ ...manifest, gates: { ...manifest.gates, tests: false } }, /deterministic gate tests did not pass/u);
  await rejectsWith({ ...manifest, gates: { ...manifest.gates, surprise: true } }, /exactly the canonical deterministic gate set/u);
  await rejectsWith({ ...manifest, npmPackages: [...manifest.npmPackages, manifest.npmPackages[0]] }, /duplicate npm package name/u);
  await rejectsWith({ ...manifest, npmPackages: manifest.npmPackages.map((pkg, index) => index === 0 ? { ...pkg, sha256: "0".repeat(64) } : pkg) }, /digest differs from the artifact bytes/u);
  const mislabeledTarball = await npmFixture("@sjunepark/not-kasb", "native");
  await rejectsWith({
    ...manifest,
    npmPackages: manifest.npmPackages.map((pkg, index) => index === 0 ? { ...mislabeledTarball, name: pkg.name } : pkg),
  }, /manifest identity differs from its npm tarball/u);
  await rejectsWith({ ...manifest, githubAssets: manifest.githubAssets.slice(1) }, /exactly 8 GitHub assets/u);
  const checksumIndex = manifest.githubAssets.findIndex(({ name }) => name === "SHA256SUMS");
  const checksum = manifest.githubAssets[checksumIndex];
  const badChecksumBytes = Buffer.from(
    (await readFile(resolve(repositoryRoot, checksum.file), "utf8")).replace(/^[0-9a-f]{64}/u, "0".repeat(64)),
  );
  await writeFile(resolve(repositoryRoot, checksum.file), badChecksumBytes);
  await rejectsWith({
    ...manifest,
    githubAssets: manifest.githubAssets.map((asset, index) => index === checksumIndex ? {
      ...asset,
      size: badChecksumBytes.length,
      sha256: createHash("sha256").update(badChecksumBytes).digest("hex"),
    } : asset),
  }, /candidate checksum for .* differs from the publishable asset bytes/u);
  await assert.rejects(
    canonicalCandidateIdentity({ mode: "rehearsal", ref: `refs/heads/${sha}`, sha }),
    /rehearsal candidate ref/u,
  );
  assert.throws(() => validatePublicationStateSource("rehearsal", { schemaVersion: 1, source: "live" }), /requires a fixture/u);
  assert.throws(() => validatePublicationStateSource("strict", { schemaVersion: 1, source: "fixture" }), /requires a live/u);

  const provenanceAsset = manifest.githubAssets.find(({ name }) => name === "provenance.json");
  const provenancePath = resolve(repositoryRoot, provenanceAsset.file);
  const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
  const emptyProvenancePath = join(directory, "empty-provenance.json");
  await writeFile(emptyProvenancePath, "");
  await assert.rejects(validateCandidateProvenance(emptyProvenancePath, identity), /provenance is empty/u);
  await writeFile(provenancePath, JSON.stringify({ ...provenance, repository: "private/fork" }));
  await assert.rejects(validateCandidateProvenance(provenancePath, identity), /repository differs/u);
  await writeFile(provenancePath, JSON.stringify(provenance));

  const installer = manifest.githubAssets.find(({ name }) => name === "install.sh");
  await writeFile(resolve(repositoryRoot, installer.file), "-----BEGIN PRIVATE KEY-----\n");
  await assert.rejects(scanCandidateText({ githubAssets: manifest.githubAssets, npmPackages: manifest.npmPackages }), /forbidden secret/u);
  await writeFile(resolve(repositoryRoot, installer.file), "fixture:install.sh\n");

  await writeFile(provenancePath, `${JSON.stringify({ ...provenance, repository: "-----BEGIN PRIVATE KEY-----" })}\n`);
  await assert.rejects(scanCandidateText({ githubAssets: manifest.githubAssets, npmPackages: manifest.npmPackages }), /forbidden secret/u);
  await writeFile(provenancePath, `${JSON.stringify(provenance)}\n`);

  const archiveAsset = manifest.githubAssets.find(({ name }) => name === identity.targets[0].archiveName);
  await standaloneFixture(identity.targets[0], "-----BEGIN PRIVATE KEY-----\n", resolve(repositoryRoot, archiveAsset.file));
  await assert.rejects(scanCandidateText({ githubAssets: manifest.githubAssets, npmPackages: manifest.npmPackages }), /forbidden secret/u);
  await standaloneFixture(identity.targets[0], "", resolve(repositoryRoot, archiveAsset.file));
  await assert.rejects(scanCandidateText({ githubAssets: manifest.githubAssets, npmPackages: manifest.npmPackages }), /README\.md is empty/u);
  await standaloneFixture(identity.targets[0], "fixture README\n", resolve(repositoryRoot, archiveAsset.file));

  for (const script of ["scripts/write-release-checksums.mjs", "scripts/validate-release-artifacts.mjs"]) {
    const reversedFlags = spawnSync(process.execPath, [resolve(repositoryRoot, script), "--candidate", "--ci"], { encoding: "utf8" });
    assert.notEqual(reversedFlags.status, 0);
    assert.match(reversedFlags.stderr, /mutually exclusive/u);
  }

  const temporaryAwsKey = `ASIA${"A".repeat(16)}`;
  await standaloneFixture(
    identity.targets[0],
    "fixture README\n",
    resolve(repositoryRoot, archiveAsset.file),
    Buffer.concat([Buffer.from([0, 1, 2, 3]), Buffer.from(temporaryAwsKey)]),
  );
  await assert.rejects(scanCandidateText({ githubAssets: manifest.githubAssets, npmPackages: manifest.npmPackages }), /forbidden secret/u);
  await standaloneFixture(identity.targets[0], "fixture README\n", resolve(repositoryRoot, archiveAsset.file));

  const packageFile = resolve(repositoryRoot, manifest.npmPackages[0].file);
  const nativeTarget = identity.targets[0];
  const contractTarget = (await loadReleaseContract()).targets.find(({ packageName }) => packageName === nativeTarget.packageName);
  const fineGrainedGithubToken = `github_pat_${"A".repeat(22)}_${"b".repeat(59)}`;
  await npmFixture(manifest.npmPackages[0].name, "native", undefined, packageFile, {
    [contractTarget.addonFile]: Buffer.concat([Buffer.from([0, 255, 0]), Buffer.from(fineGrainedGithubToken)]),
  });
  await assert.rejects(scanCandidateText({ githubAssets: manifest.githubAssets, npmPackages: manifest.npmPackages }), /forbidden secret/u);

  await npmFixture(manifest.npmPackages[0].name, "native", undefined, packageFile, {
    [contractTarget.cliFile]: Buffer.concat([Buffer.from([127, 69, 76, 70, 0]), Buffer.from(`AKIA${"B".repeat(16)}`)]),
  });
  await assert.rejects(scanCandidateText({ githubAssets: manifest.githubAssets, npmPackages: manifest.npmPackages }), /forbidden secret/u);

  await npmFixture(manifest.npmPackages[0].name, "native", "npm_abcdefghijklmnopqrstuvwxyz", packageFile);
  await assert.rejects(scanCandidateText({ githubAssets: manifest.githubAssets, npmPackages: manifest.npmPackages }), /forbidden secret/u);

  assert.doesNotThrow(() => scanText("github_pat_short ASIA1234 prefixASIAAAAAAAAAAAAAAAAA ASIAAAAAAAAAAAAAAAAAA", "documented placeholders"));
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log("release candidate metadata failure injection passed");

async function validManifest() {
  const npmPackages = [];
  for (const [name, role] of [
    ...identity.targets.map(({ packageName }) => [packageName, "native"]),
    ["@sjunepark/kasb", "root"],
  ]) {
    npmPackages.push(await npmFixture(name, role));
  }
  const contract = await loadReleaseContract();
  const githubAssets = [];
  for (const target of identity.targets) {
    const path = join(directory, target.archiveName);
    await standaloneFixture(target, "fixture README\n", path);
    githubAssets.push(fileDescriptor(path, { name: target.archiveName }, await readFile(path)));
  }
  for (const name of [contract.release.shellInstallerAsset, contract.release.powershellInstallerAsset]) {
    githubAssets.push(await fixtureFile(name, { name }));
  }
  const provenance = {
    schemaVersion: 1,
    repository: identity.repository,
    version: identity.version,
    sourceRef: identity.sourceRef,
    commit: identity.commit,
    toolchain: contract.release.toolchain,
    targets: contract.targets.map((target) => ({
      rustTarget: target.rustTarget,
      releaseTarget: target.releaseTarget,
      packageName: target.packageName,
      archiveName: target.archiveName,
      runner: { label: target.releaseRunner, os: "fixture-os", arch: "fixture-arch" },
      buildImage: target.buildContainer ?? null,
    })),
  };
  githubAssets.push(await fixtureFile(contract.release.provenanceAsset, { name: contract.release.provenanceAsset }, `${JSON.stringify(provenance)}\n`));
  const checksumBody = `${checksummedReleaseAssetNames(contract)
    .map((name) => `${githubAssets.find((asset) => asset.name === name).sha256}  ${name}`)
    .join("\n")}\n`;
  githubAssets.push(await fixtureFile(contract.release.checksumAsset, { name: contract.release.checksumAsset }, checksumBody));
  return {
    schemaVersion: 1,
    repository: identity.repository,
    version: identity.version,
    commit: identity.commit,
    targets: identity.targets.map(({ releaseTarget }) => releaseTarget),
    gates: Object.fromEntries(requiredCandidateGates.map((gate) => [gate, true])),
    npmPackages,
    githubAssets,
  };
}

async function fixtureFile(name, fields, contents = `fixture:${name}\n`) {
  const path = join(directory, name);
  await mkdir(join(path, ".."), { recursive: true });
  const bytes = Buffer.from(contents);
  await writeFile(path, bytes);
  return fileDescriptor(path, fields, bytes);
}

async function npmFixture(name, role, marker = undefined, destination = undefined, entries = {}) {
  const slug = name.replace(/[^a-z0-9]+/giu, "-");
  const source = join(directory, `${slug}-source`);
  await rm(source, { recursive: true, force: true });
  await mkdir(join(source, "package"), { recursive: true });
  await writeFile(join(source, "package", "package.json"), `${JSON.stringify({ name, version: identity.version })}\n`);
  if (marker) await writeFile(join(source, "package", "README.md"), marker);
  for (const [entry, contents] of Object.entries(entries)) {
    const path = join(source, "package", entry);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, contents);
  }
  const path = destination ?? join(directory, `${slug}.tgz`);
  const packed = spawnSync("tar", ["-czf", path, "-C", source, "package"], { encoding: "utf8" });
  assert.equal(packed.status, 0, packed.stderr);
  return fileDescriptor(path, { name, version: identity.version, role }, await readFile(path));
}

async function standaloneFixture(target, readme, path, executableBytes = Buffer.from([0, 1, 2, 3])) {
  const source = join(directory, `${target.releaseTarget}-archive`);
  await rm(source, { recursive: true, force: true });
  await mkdir(source, { recursive: true });
  const executable = target.rustTarget.includes("windows") ? "kasb.exe" : "kasb";
  await writeFile(join(source, executable), executableBytes);
  await writeFile(join(source, "LICENSE.md"), "fixture license\n");
  await writeFile(join(source, "README.md"), readme);
  await writeFile(join(source, "THIRD_PARTY_LICENSES.html"), "fixture notices\n");
  const packed = spawnSync("tar", ["-czf", path, "-C", source, executable, "LICENSE.md", "README.md", "THIRD_PARTY_LICENSES.html"], { encoding: "utf8" });
  assert.equal(packed.status, 0, packed.stderr);
}

function fileDescriptor(path, fields, bytes) {
  return {
    ...fields,
    file: relative(repositoryRoot, path),
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function rejectsWith(manifest, pattern) {
  await assert.rejects(validateArtifactManifest(identity, manifest), pattern);
}

function prebuildState() {
  return {
    schemaVersion: 1,
    source: "live",
    github: {
      schemaVersion: 1,
      repository: identity.repository,
      repositoryPrivate: false,
      immutableReleases: true,
      tag: identity.canonicalTag,
      tagSha: identity.commit,
      release: null,
    },
    npm: {
      schemaVersion: 1,
      packages: [
        ...identity.targets.map(({ packageName }) => ({ name: packageName, version: identity.version, state: "published", sha256: "b".repeat(64) })),
        { name: "@sjunepark/kasb", version: identity.version, state: "published", sha256: "c".repeat(64) },
      ],
    },
  };
}
