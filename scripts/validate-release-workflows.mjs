import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifest = JSON.parse(await readFile(resolve(root, "native-targets.json"), "utf8"));
const candidateText = await readFile(resolve(root, ".github/workflows/candidate.yml"), "utf8");
const releaseText = await readFile(resolve(root, ".github/workflows/release.yml"), "utf8");
const actionText = await readFile(resolve(root, ".github/actions/build-release-target/action.yml"), "utf8");
const consumerText = await readFile(resolve(root, "scripts/test-release-candidate-consumer.mjs"), "utf8");
const executorText = await readFile(resolve(root, "scripts/execute-release-publication.mjs"), "utf8");
const candidateContractText = await readFile(resolve(root, "scripts/release-candidate-contract.mjs"), "utf8");
const candidate = parse("candidate.yml", candidateText);
const release = parse("release.yml", releaseText);
const action = parse("build-release-target/action.yml", actionText);
const failures = [];

check(candidate.permissions?.contents === "read", "candidate workflow must be read-only");
check(equal(Object.keys(candidate.on ?? {}).sort(), ["workflow_call", "workflow_dispatch"]), "candidate must support only manual rehearsal and strict reuse");
check(candidate.on?.workflow_dispatch == null, "direct candidate dispatch must have no strict publication inputs");
check(candidate.jobs?.metadata?.if === "github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v') && inputs.mode == 'strict')", "candidate metadata must reject automatic reusable callers");
check(candidate.concurrency?.["cancel-in-progress"] === false, "candidate builds must not be cancelled in flight");

const jobs = candidate.jobs ?? {};
for (const [name, timeout] of Object.entries({
  metadata: 10,
  deterministic: 60,
  "root-package": 15,
  "native-linux": 45,
  "native-portable": 45,
  "native-consumers": 15,
  aggregate: 15,
  "sealed-candidate-e2e": 20,
  seal: 5,
})) {
  check(jobs[name]?.["timeout-minutes"] === timeout, `${name} must keep its bounded ${timeout}-minute timeout`);
}
check(needs(jobs.deterministic, ["metadata"]), "deterministic gates must follow metadata");
check(needs(jobs["root-package"], ["metadata", "deterministic"]), "root package must follow deterministic gates");
for (const name of ["native-linux", "native-portable"]) check(needs(jobs[name], ["metadata", "deterministic"]), `${name} must follow metadata and deterministic gates`);
check(needs(jobs["native-consumers"], ["metadata", "root-package", "native-linux", "native-portable"]), "clean consumers must run only after immutable target artifacts exist");
check(needs(jobs.aggregate, ["metadata", "deterministic", "root-package", "native-linux", "native-portable", "native-consumers"]), "aggregate must follow every producer and clean consumer");
check(needs(jobs["sealed-candidate-e2e"], ["metadata", "aggregate"]), "sealed native E2E must consume the aggregate");
check(needs(jobs.seal, ["aggregate", "sealed-candidate-e2e"]), "candidate outputs must remain hidden until every native E2E passes");
check(jobs.seal?.["runs-on"] === "blacksmith-2vcpu-ubuntu-2404", "candidate seal must use the available portable Linux release runner");
check(String(candidate.on?.workflow_call?.outputs?.candidate_artifact_id?.value ?? "").includes("jobs.seal.outputs"), "workflow outputs must be emitted only by the final seal job");

const metadataRun = runs(jobs.metadata).join("\n");
for (const evidence of [".targets[]", ".releaseRunner", ".buildContainer", ".validationNodeVersions", "consumer_matrix=", "e2e_matrix="]) {
  check(metadataRun.includes(evidence), `metadata must derive ${evidence} from native-targets.json`);
}
const authority = (jobs.metadata?.steps ?? []).find(({ id }) => id === "authority");
const authorityRun = typeof authority?.run === "string" ? authority.run : "";
const matrixGateIndex = authorityRun.indexOf("validate-release-contract.mjs --release-matrix-only");
const matrixEmitIndex = authorityRun.indexOf("linux_matrix=");
check(
  matrixGateIndex >= 0 && matrixEmitIndex >= 0 && matrixGateIndex < matrixEmitIndex,
  "metadata must reject noncanonical target scheduling before emitting any runner matrix",
);
check(String(jobs["native-linux"]?.strategy?.matrix).includes("needs.metadata.outputs.linux_matrix"), "Linux matrix must be metadata-derived");
check(String(jobs["native-portable"]?.strategy?.matrix).includes("needs.metadata.outputs.portable_matrix"), "portable matrix must be metadata-derived");
check(String(jobs["native-consumers"]?.strategy?.matrix).includes("needs.metadata.outputs.consumer_matrix"), "clean-consumer matrix must be metadata-derived");
check(String(jobs["sealed-candidate-e2e"]?.strategy?.matrix).includes("needs.metadata.outputs.e2e_matrix"), "E2E matrix must be metadata-derived");
const windowsProtocols = (jobs["native-portable"]?.steps ?? []).find((step) => step.name === "Test Windows upgrade and installer protocols");
check(
  windowsProtocols?.if === "runner.os == 'Windows'" && windowsProtocols?.shell === "bash"
    && windowsProtocols?.env?.KASB_REQUIRE_POWERSHELL_TESTS === "1",
  "Windows candidate must require native upgrade and PowerShell installer protocol tests",
);
for (const command of ["cargo test --locked -p kasb-cli --lib", "rustup component add clippy", "cargo clippy --locked -p kasb-cli --all-targets -- -D warnings", "node scripts/test-installers.mjs --powershell-only --build-windows-cli"]) {
  check(String(windowsProtocols?.run).includes(command), `Windows candidate protocol gate is missing ${command}`);
}
check(!Object.hasOwn(action.inputs ?? {}, "validation_node_versions"), "target producers must not accept mutable consumer runtime inputs");
check(!actionText.includes("npx ") && !actionText.includes("test-native-consumer.mjs"), "target producers must not execute mutable consumer tooling after artifact assembly");
check(hasRun(jobs["native-consumers"], "test-native-consumer.mjs"), "isolated clean-consumer jobs must exercise installed native packages");
check(
  String((jobs["native-consumers"]?.steps ?? []).find(({ uses }) => String(uses).startsWith("actions/setup-node@"))?.with?.["node-version"]).includes("matrix.node_version"),
  "isolated clean-consumer jobs must select the manifest-authorized Node runtime through setup-node",
);

for (const command of ["bun run contracts:check", "bun run native:check", "bun run licenses:check", "bun run typecheck", "bun run test", "bun run test:release-pipeline", "bun run conformance:judge", "bun run build", "cargo fmt --all --check", "cargo clippy --locked --workspace --all-targets -- -D warnings"]) {
  check(hasRun(jobs.deterministic, command), `deterministic candidate gate is missing ${command}`);
}
for (const command of ["cargo build --locked --release --target", "assemble-native-package.mjs", "assemble-cli-archive.mjs", "write-release-target-provenance.mjs"]) {
  check(actionText.includes(command), `target builder is missing ${command}`);
}
check(!actionText.includes("jq "), "cross-platform target action must not assume jq is installed");
check(actionText.includes("npm install --global npm@11.6.2") && hasRun(jobs["root-package"], "npm install --global npm@11.6.2"), "all npm packaging must pin 11.6.2 on Node 24");
const candidateSteps = Object.values(jobs).flatMap((job) => job?.steps ?? []);
const candidatePackagingSteps = Object.entries(jobs)
  .filter(([name]) => name !== "native-consumers")
  .flatMap(([, job]) => job?.steps ?? []);
const releaseSteps = Object.values(release.jobs ?? {}).flatMap((job) => job?.steps ?? []);
const actionSteps = action.runs?.steps ?? [];
check(
  actionSteps.some(
    (step) => step?.if === "runner.os == 'Windows'"
      && String(step?.uses).startsWith("KyleMayes/install-llvm-action@")
      && step?.with?.version === "18.1.8",
  ),
  "target builder must install the exact Windows LLVM toolchain used by Rust bindgen",
);
check(
  actionSteps.some(
    (step) => step?.if === "runner.os == 'Windows'"
      && step?.shell === "pwsh"
      && typeof step?.run === "string"
      && step.run.includes("libclang.dll")
      && step.run.includes("LIBCLANG_PATH=$llvmBin")
      && step.run.includes("$env:GITHUB_ENV"),
  ),
  "target builder must expose its verified Windows libclang directory to Rust bindgen",
);
for (const [scope, steps] of [["candidate", candidatePackagingSteps], ["release", releaseSteps], ["target action", actionSteps]]) {
  const nodeSteps = steps.filter(({ uses }) => String(uses).startsWith("actions/setup-node@"));
  check(nodeSteps.length > 0 && nodeSteps.every((step) => String(step.with?.["node-version"]) === manifest.release.toolchain.node), `${scope} Node setup must match native-targets.json`);
}
for (const [scope, steps] of [["candidate", candidatePackagingSteps], ["target action", actionSteps]]) {
  const npmVersions = steps.flatMap(({ run }) => [...String(run ?? "").matchAll(/\bnpm install --global npm@([^\s\\]+)/gu)].map((match) => match[1]));
  check(npmVersions.length > 0 && npmVersions.every((version) => version === manifest.release.toolchain.npm), `${scope} npm setup must match native-targets.json`);
}
const actionRustSteps = actionSteps.filter(({ uses }) => String(uses).startsWith("actions-rust-lang/setup-rust-toolchain@"));
check(actionRustSteps.length > 0 && actionRustSteps.every((step) => String(step.with?.toolchain) === manifest.release.toolchain.rust), "target action Rust setup must match native-targets.json");
const candidateRustSetup = candidateSteps.find(({ name }) => String(name).startsWith("Set up Rust"));
const candidateRustVersions = [...String(candidateRustSetup?.run ?? "").matchAll(/\brustup (?:toolchain install|default) ([^\s\\]+)/gu)].map((match) => match[1]);
check(
  candidateRustVersions.length === 2 && candidateRustVersions.every((version) => version === manifest.release.toolchain.rust),
  "candidate Rust setup must match native-targets.json",
);
check(actionText.includes("dist/native/*.tgz") && actionText.includes("dist/cli/*.tar.gz") && !actionText.includes("dist/**"), "target uploads must be allowlisted");
for (const step of action.runs?.steps ?? []) {
  check(!String(step?.run ?? "").includes("${{ inputs."), `composite shell step ${step?.name ?? "<unnamed>"} must receive inputs through env`);
}
for (const [jobName, job] of Object.entries(jobs)) for (const step of job?.steps ?? []) {
  check(!String(step?.run ?? "").includes("${{"), `${jobName} shell step ${step?.name ?? "<unnamed>"} must receive GitHub values through env`);
}
check(action.runs?.steps?.[0]?.name === "Validate bounded release target inputs", "target producer must validate inputs before setup, build, or artifact operations");
check(
  ["x86_64-unknown-linux-gnu", "aarch64-unknown-linux-gnu", "aarch64-apple-darwin", "x86_64-pc-windows-msvc"].every((target) => actionText.includes(target)),
  "target producer must validate the complete target allowlist before invoking build tools",
);
check(
  actionText.includes("candidate-consumer-probe-${{ inputs.rust_target }}")
    && candidateText.includes("candidate-consumer-probe-${{ matrix.rust_target }}"),
  "isolated clean consumers must receive the exact producer-built process probe by artifact",
);

check(hasRun(jobs.aggregate, "write-release-checksums.mjs --candidate"), "aggregate must checksum all publishable assets");
check(hasRun(jobs.aggregate, "validate-release-artifacts.mjs --candidate"), "aggregate must run full candidate-aware artifact validation");
check(hasRun(jobs.aggregate, "write-release-candidate-manifest.mjs --sha \"$CANDIDATE_SHA\" --output dist/release/artifact-manifest.json"), "aggregate must write the raw artifact manifest to its canonical path");
check(hasRun(jobs.aggregate, "--artifact-manifest dist/release/artifact-manifest.json --output dist/release/candidate.json"), "candidate validator must turn the raw manifest into the proof-bearing candidate receipt");
const aggregateUpload = (jobs.aggregate?.steps ?? []).find(({ id }) => id === "upload");
check(equal(paths(aggregateUpload), ["dist/cli/*.tar.gz", "dist/cli/SHA256SUMS", "dist/installers/install.ps1", "dist/installers/install.sh", "dist/native/*.tgz", "dist/provenance/provenance.json", "dist/release/artifact-manifest.json", "dist/release/candidate.json", "dist/root/*.tgz"].sort()), "sealed candidate upload must contain the raw manifest, proof-bearing receipt, and only canonical artifacts");
const e2e = jobs["sealed-candidate-e2e"];
check(hasInput(e2e, "artifact-ids") && hasRun(e2e, "test-release-candidate-consumer.mjs"), "every native E2E must download the aggregate by ID and consume it");
const e2eConsumer = (e2e?.steps ?? []).find(({ run }) => String(run).includes("test-release-candidate-consumer.mjs"));
check(e2eConsumer?.shell === "bash", "sealed native E2E must use one portable shell on every target runner");
check(String(e2eConsumer?.env?.KASB_CANDIDATE_SHA).includes("needs.metadata.outputs.sha"), "sealed native E2E must compare the receipt with the checked-out PR head rather than GitHub's merge SHA");
check(consumerText.includes('localTarInvocation(archive, "-xzf"'), "sealed candidate extraction must keep Windows drive paths out of tar archive operands");
check(consumerText.includes("localTarDestination(archive, extracted)"), "sealed candidate extraction must keep Windows drive paths out of tar destination operands");
for (const evidence of ["candidateReceiptFile", "candidateRoot", "installers", "receiptBytes", '["upgrade", "--check"]', '["upgrade"]', "same-version ${operation} must not change the managed binary", "same-version ${operation} must not change the managed receipt"]) {
  check(consumerText.includes(evidence), `sealed candidate consumer is missing ${evidence}`);
}
check(!/\b(?:cargo build|npm pack|bun run build)\b/u.test(consumerText), "sealed candidate consumer must never rebuild");

const tagPush = "github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')";
check(equal(Object.keys(release.on ?? {}), ["push", "workflow_dispatch"]) && equal(release.on.push, { tags: ["v*"] }), "publication must start only from version tag pushes; dispatch is rehearsal");
check(release.permissions?.contents === "read" && release.concurrency?.group === "canonical-release" && release.concurrency?.["cancel-in-progress"] === false, "publication defaults must be read-only, non-cancelling, and serialized across versions");
const releaseJobs = release.jobs ?? {};
const preflight = releaseJobs["publication-state"];
check(preflight?.if === tagPush && equal(preflight.permissions, { contents: "read" }) && !preflight.environment, "preflight must inspect tag pushes with the read-only job token");
check(hasRun(preflight, 'release-version.mjs source "$GITHUB_REF_NAME"'), "preflight must bind tag/version/checkout and main ancestry");
check(releaseJobs.candidate?.uses === "./.github/workflows/candidate.yml" && releaseJobs.candidate?.with?.mode === "${{ github.event_name == 'push' && 'strict' || 'rehearsal' }}", "release must route tag pushes to strict candidates and manual runs to rehearsals");
check(releaseJobs.candidate?.if === "always() && (needs.publication-state.result == 'success' || (github.event_name == 'workflow_dispatch' && needs.publication-state.result == 'skipped'))", "manual rehearsal must survive the skipped preflight without bypassing a failed release preflight");
check(releaseJobs["github-release"]?.if === tagPush && !releaseJobs["github-release"].environment && equal(releaseJobs["github-release"].permissions, { contents: "write" }), "GitHub executor must use a tag-push-only job-scoped write token");
check(!releaseText.includes("KASB_GITHUB_RELEASE_SENTINEL") && !releaseText.includes("create-github-app-token@") && !releaseText.includes("KASB_RELEASE_APP"), "GitHub release must not depend on sentinels or a policy App");
for (const name of ["publication-state", "github-release"]) {
  check((releaseJobs[name]?.steps ?? []).some((step) => step.env?.GH_TOKEN === "${{ github.token }}"), `${name} must use the job token`);
}
check(equal(Object.keys(releaseJobs).sort(), ["candidate", "github-release", "publication-state"]), "release must contain only GitHub state, candidate, and publication jobs");
check(!releaseText.includes("id-token:") && !releaseText.includes("KASB_NPM_RELEASE_SENTINEL"), "release must not retain registry publication credentials");
{
  const name = "github-release";
  const channel = "github";
  const firstStep = releaseJobs[name]?.steps?.[0];
  const receiptPath = `\${{ runner.temp }}/${channel}-publication-receipt.json`;
  check(
    String(firstStep?.run ?? "").includes(`"channel":"${channel}"`)
      && firstStep?.env?.PUBLICATION_RECEIPT === receiptPath
      && String(firstStep?.run ?? "").includes('> "$PUBLICATION_RECEIPT"')
      && String(firstStep?.run ?? "").includes('"code":"not_started"'),
    `${name} must seed its truthful not-started receipt outside the checkout before any fallible setup`,
  );
  const executorStep = (releaseJobs[name]?.steps ?? []).find(({ run }) => String(run).includes("execute-release-publication.mjs"));
  check(
    executorStep?.env?.PUBLICATION_RECEIPT === receiptPath
      && String(executorStep?.run ?? "").includes('"code":"outcome_unknown"')
      && String(executorStep?.run ?? "").includes('--output "$PUBLICATION_RECEIPT"'),
    `${name} must conservatively arm and finalize the same durable receipt around mutation`,
  );
  const uploadStep = (releaseJobs[name]?.steps ?? []).find(({ uses }) => String(uses).startsWith("actions/upload-artifact@"));
  check(uploadStep?.with?.path === receiptPath, `${name} must upload the durable receipt from runner.temp`);
  check(hasInput(releaseJobs[name], "artifact-ids"), `${name} must consume the exact candidate artifact by ID`);
  check(hasRun(releaseJobs[name], "--artifact-manifest dist/release/artifact-manifest.json") && hasRun(releaseJobs[name], "--output dist/release/candidate.json"), `${name} must revalidate the raw manifest into the default planner candidate path`);
  check(!hasAnyRun(releaseJobs[name], /\b(?:cargo build|npm pack|bun run build)\b/u), `${name} must never rebuild`);
  check(hasRun(releaseJobs[name], "execute-release-publication.mjs"), `${name} must invoke the tested deterministic executor`);
}
check(!releaseText.includes("gh release") && !releaseText.includes("npm publish"), "workflow YAML must not duplicate publication mutation logic");
check(!releaseText.includes("--immutability-confirmation"), "publication must not trust an unauthenticated immutability confirmation file");
check(!releaseText.includes("(?:sha256:)"), "workflow digest validation must use portable Bash ERE syntax");
check((releaseJobs["github-release"]?.steps ?? []).some((step) => step.if === "always()" && String(step.uses).startsWith("actions/upload-artifact@")), "GitHub receipt must upload on failure");
check(executorText.includes("executeGitHubPublication"), "production CLI must use the deterministically tested GitHub executor");
check(candidateContractText.includes("rerun only the failed publication job"), "strict fresh candidates must fail closed when release state already exists");
check(!candidateText.includes("npm publish") && !candidateText.includes("gh release"), "rehearsal must remain structurally non-publishing");

for (const [name, text] of [["candidate", candidateText], ["release", releaseText], ["target action", actionText]]) {
  for (const line of text.split(/\r?\n/u).filter((entry) => /\buses:/u.test(entry) && !entry.includes("./"))) {
    check(/@[0-9a-f]{40}\s+#\s+v\d+\b/iu.test(line), `${name} has an unpinned or unannotated action: ${line.trim()}`);
  }
  if (name !== "target action") for (const job of Object.values(parse(`${name} workflow`, text).jobs ?? {})) for (const step of job?.steps ?? []) {
    if (String(step?.uses).startsWith("actions/checkout@")) check(step.with?.["persist-credentials"] === false, `${name} checkout must disable credential persistence`);
  }
}

if (failures.length) throw new Error(`Release workflow validation failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
console.log("release workflows derive one four-target candidate and guard tested receipt-owning publication");

function parse(name, text) { const document = parseDocument(text); if (document.errors.length) throw new Error(`${name} is invalid YAML: ${document.errors.map(({ message }) => message).join("; ")}`); return document.toJS(); }
function runs(job) { return (job?.steps ?? []).filter(({ run }) => typeof run === "string").map(({ run }) => run); }
function hasRun(job, value) { return runs(job).some((run) => run.includes(value)); }
function hasAnyRun(job, value) { return runs(job).some((run) => value.test(run)); }
function hasInput(job, input) { return (job?.steps ?? []).some((step) => Object.hasOwn(step?.with ?? {}, input)); }
function needs(job, expected) { return equal(Array.isArray(job?.needs) ? job.needs : [job?.needs].filter(Boolean), expected); }
function paths(step) { return String(step?.with?.path ?? "").trim().split(/\r?\n/u).sort(); }
function equal(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function check(value, message) { if (!value) failures.push(message); }
