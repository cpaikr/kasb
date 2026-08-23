import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseDocument } from "yaml";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifest = JSON.parse(await readFile(resolve(repositoryRoot, "native-targets.json"), "utf8"));
const workflowText = await readFile(resolve(repositoryRoot, ".github/workflows/ci.yml"), "utf8");
const document = parseDocument(workflowText);
if (document.errors.length > 0) {
  throw new Error(`Native CI workflow is invalid YAML: ${document.errors.map(({ message }) => message).join("; ")}`);
}
const workflow = document.toJS();
const missing = [];
const jobs = workflow?.jobs ?? {};
const deterministicJob = jobs.deterministic;
const linuxJob = jobs["native-linux"];
const nativeJob = jobs.native;
const artifactJob = jobs["artifact-set"];

const linuxTargets = manifest.targets.filter(({ libc }) => libc === "glibc");
const otherTargets = manifest.targets.filter(({ libc }) => libc !== "glibc");
check(
  hasRun(deterministicJob, "cargo install cargo-about --version 0.9.2 --locked --features cli"),
  "deterministic validation must install the cargo-about CLI feature",
);
check(
  hasRun(linuxJob, "dnf install -y clang-devel"),
  "native-linux must install libclang for dependency binding generation",
);
check(
  sameValue(matrix(linuxJob), linuxTargets.map((target) => ({
    rust_target: target.rustTarget,
    runner: target.runner,
    package_directory: target.packageDirectory,
    build_container: target.buildContainer,
  }))),
  "native-linux must own the exact GNU/Linux target tuples",
);
check(
  sameValue(matrix(nativeJob), otherTargets.map((target) => ({
    rust_target: target.rustTarget,
    runner: target.runner,
    package_directory: target.packageDirectory,
  }))),
  "native must own the exact non-Linux target tuples",
);
check(linuxJob?.container?.image === "${{ matrix.build_container }}", "native-linux must use its target build container");

for (const [name, job] of [["native-linux", linuxJob], ["native", nativeJob]]) {
  check(job?.needs === "root-package", `${name} must consume the immutable root package`);
  assertConsumerMatrix(name, job);
  for (const command of [
    "cargo build --locked --release --target ${{ matrix.rust_target }} -p kasb-node --lib --bin kasb-process-probe",
    "cargo build --locked --release --target ${{ matrix.rust_target }} -p kasb-cli --bin kasb",
    "node scripts/assemble-native-package.mjs ${{ matrix.rust_target }}",
    "node scripts/assemble-cli-archive.mjs ${{ matrix.rust_target }}",
  ]) {
    check(hasRun(job, command), `${name} is missing: ${command}`);
  }
}
check(
  hasRun(linuxJob, "node scripts/validate-glibc-floor.mjs ${{ matrix.rust_target }}"),
  "native-linux must enforce the glibc floor",
);
check(
  !hasRun(nativeJob, "node scripts/validate-glibc-floor.mjs ${{ matrix.rust_target }}"),
  "non-Linux targets must not run the glibc floor gate",
);
check(
  sameValue([...(artifactJob?.needs ?? [])].sort(), ["native", "native-linux", "root-package"].sort()),
  "artifact-set must depend on the root and both native jobs",
);
for (const expected of ["native-*", "cli-*", "root-package"]) {
  check(
    (artifactJob?.steps ?? []).some((step) => step?.with?.pattern === expected || step?.with?.name === expected),
    `artifact-set must download ${expected}`,
  );
}
check(
  (artifactJob?.steps ?? []).some(
    (step) => typeof step?.run === "string" && step.run.trim() === "node scripts/validate-release-artifacts.mjs",
  ),
  "artifact-set must run the aggregate release-artifact validator",
);

for (const [jobName, job] of Object.entries(jobs)) {
  for (const step of job?.steps ?? []) {
    if (typeof step?.uses !== "string") continue;
    const reference = step.uses.match(/@([^\s#]+)/u)?.[1];
    check(/^[0-9a-f]{40}$/iu.test(reference ?? ""), `${jobName} has an action without a full commit pin: ${step.uses}`);
  }
}
for (const line of workflowText.split(/\r?\n/u).filter((candidate) => /\buses:/u.test(candidate))) {
  check(/#\s*v\d+\b/u.test(line), `action pin is missing its reviewed major annotation: ${line.trim()}`);
}

if (missing.length > 0) {
  throw new Error(`Native CI workflow validation failed:\n${missing.map((message) => `- ${message}`).join("\n")}`);
}
console.log("native CI workflow matches the target manifest and consumer ownership");

function matrix(job) {
  return job?.strategy?.matrix?.include ?? [];
}

function hasRun(job, command) {
  return (job?.steps ?? []).some((step) => typeof step?.run === "string" && step.run.includes(command));
}

function assertConsumerMatrix(name, job) {
  let activeNodeVersion;
  const observed = [];
  for (const step of job?.steps ?? []) {
    if (typeof step?.uses === "string" && step.uses.startsWith("actions/setup-node@")) {
      activeNodeVersion = String(step.with?.["node-version"] ?? "");
      continue;
    }
    if (typeof step?.run !== "string" || !step.run.includes("node scripts/test-native-consumer.mjs")) continue;
    observed.push({
      version: activeNodeVersion,
      directArchive: step.run.includes("dist/cli"),
    });
  }
  check(
    sameValue(observed.map(({ version }) => version), manifest.validationNodeVersions),
    `${name} must run the packed consumer once for every declared Node version in order`,
  );
  check(
    sameValue(observed.filter(({ directArchive }) => directArchive).map(({ version }) => version), ["24"]),
    `${name} must exercise the direct CLI archive exactly on Node 24`,
  );
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function check(condition, message) {
  if (!condition) missing.push(message);
}
