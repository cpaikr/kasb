import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

if (process.argv[2] === "--self-test") {
  assert.deepEqual(glibcVersions("GLIBC_2.2.5 GLIBC_2.28 GLIBC_2.2.5"), ["2.2.5", "2.28"]);
  assertFloor("self-test", ["2.2.5", "2.28"], "2.28");
  assert.throws(
    () => assertFloor("self-test", ["2.29"], "2.28"),
    /requires GLIBC_2\.29, newer than the approved GLIBC_2\.28 floor/u,
  );
  console.log("glibc floor validator rejects newer symbol requirements");
  process.exit(0);
}

const rustTarget = process.argv[2];
if (!rustTarget) {
  throw new Error("Usage: node scripts/validate-glibc-floor.mjs <rust-target>");
}

const manifest = JSON.parse(await readFile(resolve(repositoryRoot, "native-targets.json"), "utf8"));
const target = manifest.targets.find((candidate) => candidate.rustTarget === rustTarget);
if (!target) throw new Error(`Unknown native target: ${rustTarget}`);
if (target.libc !== "glibc") throw new Error(`${rustTarget} is not a GNU/Linux glibc target`);

const runtimeGlibc = process.report?.getReport?.()?.header?.glibcVersionRuntime;
if (runtimeGlibc !== manifest.minimumGlibcVersion) {
  throw new Error(
    `The GNU/Linux floor gate must run on glibc ${manifest.minimumGlibcVersion}; observed ${runtimeGlibc ?? "unknown"}.`,
  );
}

const packageDirectory = resolve(repositoryRoot, manifest.nativePackageRoot, target.packageDirectory);
const artifacts = [target.addonFile, target.cliFile];
for (const artifact of artifacts) {
  const path = resolve(packageDirectory, artifact);
  const inspection = spawnSync("readelf", ["--version-info", "--wide", path], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (inspection.error) throw inspection.error;
  if (inspection.status !== 0) {
    throw new Error(`Could not inspect glibc requirements for ${artifact}: ${inspection.stderr.trim()}`);
  }
  const versions = glibcVersions(inspection.stdout);
  if (versions.length === 0) throw new Error(`${artifact} has no inspectable GLIBC symbol requirements`);
  assertFloor(artifact, versions, manifest.minimumGlibcVersion);
  console.log(`${artifact} maximum glibc requirement: ${versions.at(-1)}`);
}

function glibcVersions(text) {
  return [...new Set([...text.matchAll(/\bGLIBC_(\d+(?:\.\d+)+)\b/gu)].map((match) => match[1]))]
    .sort(compareVersions);
}

function assertFloor(artifact, versions, floor) {
  const newest = [...versions].sort(compareVersions).at(-1);
  if (newest && compareVersions(newest, floor) > 0) {
    throw new Error(`${artifact} requires GLIBC_${newest}, newer than the approved GLIBC_${floor} floor`);
  }
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
