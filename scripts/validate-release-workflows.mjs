import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseDocument } from "yaml";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifest = JSON.parse(await readFile(resolve(root, "native-targets.json"), "utf8"));
const candidateText = await readFile(resolve(root, ".github/workflows/candidate.yml"), "utf8");
const releaseText = await readFile(resolve(root, ".github/workflows/release.yml"), "utf8");
const actionText = await readFile(resolve(root, ".github/actions/build-release-target/action.yml"), "utf8");
const candidate = parse("candidate.yml", candidateText);
const release = parse("release.yml", releaseText);
const action = parse("build-release-target/action.yml", actionText);
const failures = [];

check(candidate.permissions?.contents === "read", "candidate workflow must have read-only top-level permissions");
check(!candidate.on?.pull_request_target, "candidate workflow must never use pull_request_target");
check(Boolean(candidate.on?.pull_request), "candidate workflow must run an exact non-publishing PR rehearsal");
check(Boolean(candidate.on?.workflow_call), "candidate workflow must be reusable by the strict tag caller");
check(Object.hasOwn(candidate.on ?? {}, "workflow_dispatch"), "candidate workflow must support an explicit rehearsal dispatch");
check(candidate.concurrency?.["cancel-in-progress"] === false, "candidate workflow must not cancel an in-flight immutable build");

const jobs = candidate.jobs ?? {};
check(needs(jobs.deterministic, ["metadata"]), "deterministic gates must follow metadata");
check(needs(jobs["root-package"], ["metadata", "deterministic"]), "root package must follow metadata and deterministic gates");
for (const name of ["native-linux", "native-portable"]) {
  check(needs(jobs[name], ["metadata", "deterministic", "root-package"]), `${name} must depend on deterministic validation and the root tarball`);
}
check(
  needs(jobs.aggregate, ["metadata", "deterministic", "root-package", "native-linux", "native-portable"]),
  "aggregate must depend on every deterministic and four-target producer",
);

const observedTargets = [
  ...matrix(jobs["native-linux"]),
  ...matrix(jobs["native-portable"]),
].map(({ rust_target }) => rust_target);
check(equal(observedTargets, manifest.targets.map(({ rustTarget }) => rustTarget)), "candidate matrix must build the exact four supported targets");
check(matrix(jobs["native-portable"]).some(({ rust_target, runner }) => rust_target === "aarch64-apple-darwin" && runner === "macos-15"), "macOS ARM64 must use the GitHub-hosted macos-15 runner");
check(matrix(jobs["native-portable"]).some(({ rust_target, runner }) => rust_target === "x86_64-pc-windows-msvc" && runner === "windows-2025"), "Windows x64 must use windows-2025");

for (const command of [
  "bun run contracts:check",
  "bun run native:check",
  "bun run licenses:check",
  "bun run typecheck",
  "bun run test",
  "bun run conformance:judge",
  "bun run build",
  "cargo fmt --all --check",
  "cargo clippy --locked --workspace --all-targets -- -D warnings",
]) check(hasRun(jobs.deterministic, command), `deterministic candidate gate is missing ${command}`);

for (const command of [
  "cargo build --locked --release --target",
  "node scripts/assemble-native-package.mjs",
  "node scripts/assemble-cli-archive.mjs",
  "node scripts/test-native-consumer.mjs",
]) check(actionText.includes(command), `target builder is missing ${command}`);
for (const version of manifest.validationNodeVersions) check(actionText.includes(version), `target builder is missing Node ${version} consumer coverage`);
check(actionText.includes("dist/native/*.tgz") && actionText.includes("dist/cli/*.tar.gz"), "target upload must allowlist native and standalone artifacts");
check(!actionText.includes("dist/**"), "target upload must not use a broad dist glob");

check(hasRun(jobs.aggregate, "node scripts/write-release-checksums.mjs --candidate"), "aggregate must checksum every publishable candidate asset");
check(hasRun(jobs.aggregate, "node scripts/validate-release-artifacts.mjs"), "aggregate must independently validate all four target artifacts");
check(hasRun(jobs.aggregate, "node scripts/write-release-candidate-manifest.mjs"), "aggregate must emit a hashed candidate manifest");
check(hasRun(jobs.aggregate, "--artifact-manifest dist/release/artifact-manifest.json"), "aggregate must reconcile candidate metadata after artifacts exist");
const aggregateUpload = (jobs.aggregate?.steps ?? []).find(({ id }) => id === "upload");
const candidatePaths = String(aggregateUpload?.with?.path ?? "").trim().split(/\r?\n/u).sort();
check(equal(candidatePaths, [
  "dist/cli/*.tar.gz",
  "dist/cli/SHA256SUMS",
  "dist/installers/install.ps1",
  "dist/installers/install.sh",
  "dist/native/*.tgz",
  "dist/provenance/provenance.json",
  "dist/release/artifact-manifest.json",
  "dist/release/candidate-metadata.json",
  "dist/root/*.tgz",
].sort()), "final candidate upload must use the exact allowlisted artifact paths");

check(equal(Object.keys(release.on ?? {}), ["push"]), "publication workflow must be tag-push-only");
check(equal(release.on?.push?.tags, ["v*"]), "publication workflow must accept only canonical version tag shapes");
check(release.permissions?.contents === "read", "publication workflow top-level permissions must be read-only");
check(release.concurrency?.["cancel-in-progress"] === false, "publication workflow must not cancel an in-flight release");
const releaseJobs = release.jobs ?? {};
check(releaseJobs.candidate?.uses === "./.github/workflows/candidate.yml", "publication must call the repository-owned candidate workflow");
check(releaseJobs.candidate?.with?.mode === "strict", "publication must use strict candidate metadata");
check(releaseJobs["github-release"]?.environment === "github-release", "GitHub mutation must use its protected environment");
check(equal(releaseJobs["github-release"]?.permissions, { contents: "write" }), "GitHub mutation must have only contents:write");
check(releaseJobs["npm-release"]?.environment === "npm-release", "npm mutation must use its protected environment");
check(releaseJobs["npm-release"]?.["runs-on"] === "ubuntu-24.04", "npm trusted publishing must use a GitHub-hosted runner");
check(equal(releaseJobs["npm-release"]?.permissions, { contents: "read", "id-token": "write" }), "npm trusted publishing must have only contents:read and id-token:write");
for (const name of ["github-release", "npm-release"]) {
  check(hasInput(releaseJobs[name], "artifact-ids"), `${name} must consume the immutable candidate artifact by ID`);
  check(!hasAnyRun(releaseJobs[name], /\b(?:cargo build|npm pack|bun run build)\b/u), `${name} must never rebuild candidate artifacts`);
}
check(hasRun(releaseJobs["github-release"], "--phase verify"), "GitHub publication must verify immutable exact release state");
check(hasRun(releaseJobs["npm-release"], "--phase verify"), "npm publication must reverify GitHub state before registry mutation");
check(hasRun(releaseJobs["npm-release"], "npm publish"), "npm publication must use trusted npm publish");
check(hasRun(releaseJobs["npm-release"], "publication-report.json"), "npm publication must always record machine-readable partial state");
check((releaseJobs["npm-release"]?.steps ?? []).some((step) => step?.if === "always()" && step?.uses?.startsWith("actions/upload-artifact@")), "publication report must upload even after partial failure");
check(releaseText.includes("candidate_artifact_digest"), "publication must intentionally record the server-computed candidate digest");
check(releaseText.indexOf("role == \"native\"") < releaseText.indexOf("role == \"root\""), "native packages must publish before the root package");
check(!candidateText.includes("npm publish") && !candidateText.includes("gh release"), "rehearsal workflow must contain no publication commands");

for (const [name, text] of [["candidate", candidateText], ["release", releaseText], ["target action", actionText]]) {
  for (const line of text.split(/\r?\n/u).filter((entry) => /\buses:/u.test(entry) && !entry.includes("./"))) {
    check(/@[0-9a-f]{40}\s+#\s+v\d+\b/iu.test(line), `${name} has an unpinned or unannotated action: ${line.trim()}`);
  }
  if (name !== "target action") {
    for (const job of Object.values(parse(`${name} workflow`, text).jobs ?? {})) {
      for (const step of job?.steps ?? []) {
        if (typeof step?.uses === "string" && step.uses.startsWith("actions/checkout@")) {
          check(step.with?.["persist-credentials"] === false, `${name} checkout must disable credential persistence`);
        }
      }
    }
  }
}

if (failures.length > 0) throw new Error(`Release workflow validation failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
console.log("release workflows enforce non-publishing four-target rehearsal and guarded immutable publication");

function parse(name, text) {
  const document = parseDocument(text);
  if (document.errors.length > 0) throw new Error(`${name} is invalid YAML: ${document.errors.map(({ message }) => message).join("; ")}`);
  return document.toJS();
}

function matrix(job) { return job?.strategy?.matrix?.include ?? []; }
function needs(job, expected) { return equal(Array.isArray(job?.needs) ? job.needs : [job?.needs].filter(Boolean), expected); }
function equal(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function hasRun(job, text) { return (job?.steps ?? []).some((step) => typeof step?.run === "string" && step.run.includes(text)); }
function hasAnyRun(job, expression) { return (job?.steps ?? []).some((step) => typeof step?.run === "string" && expression.test(step.run)); }
function hasInput(job, input) { return (job?.steps ?? []).some((step) => Object.hasOwn(step?.with ?? {}, input)); }
function check(condition, message) { if (!condition) failures.push(message); }
