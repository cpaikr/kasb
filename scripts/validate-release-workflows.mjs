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
check(Object.hasOwn(candidate.on ?? {}, "pull_request"), "candidate must run a non-publishing PR rehearsal");
for (const requiredPath of [".github/actions/build-release-target/**", "crates/**", "packages/**", "README.md", "LICENSE.md", "THIRD_PARTY_LICENSES.html"]) {
  check(!candidate.on?.pull_request?.paths || candidate.on.pull_request.paths.includes(requiredPath), `candidate PR trigger must include ${requiredPath}`);
}
check(Object.hasOwn(candidate.on ?? {}, "workflow_call") && Object.hasOwn(candidate.on ?? {}, "workflow_dispatch"), "candidate must support strict reuse and manual rehearsal");
check(!candidate.on?.pull_request_target, "candidate must never use pull_request_target");
check(candidate.concurrency?.["cancel-in-progress"] === false, "candidate builds must not be cancelled in flight");

const jobs = candidate.jobs ?? {};
check(needs(jobs.deterministic, ["metadata"]), "deterministic gates must follow metadata");
check(needs(jobs["root-package"], ["metadata", "deterministic"]), "root package must follow deterministic gates");
for (const name of ["native-linux", "native-portable"]) check(needs(jobs[name], ["metadata", "deterministic", "root-package"]), `${name} must follow every shared gate`);
check(needs(jobs.aggregate, ["metadata", "deterministic", "root-package", "native-linux", "native-portable"]), "aggregate must follow every producer");
check(needs(jobs["sealed-candidate-e2e"], ["metadata", "aggregate"]), "sealed native E2E must consume the aggregate");
check(needs(jobs.seal, ["aggregate", "sealed-candidate-e2e"]), "candidate outputs must remain hidden until every native E2E passes");
check(String(candidate.on?.workflow_call?.outputs?.candidate_artifact_id?.value ?? "").includes("jobs.seal.outputs"), "workflow outputs must be emitted only by the final seal job");

const metadataRun = runs(jobs.metadata).join("\n");
for (const evidence of [".targets[]", ".releaseRunner", ".buildContainer", ".validationNodeVersions", "e2e_matrix="]) {
  check(metadataRun.includes(evidence), `metadata must derive ${evidence} from native-targets.json`);
}
check(String(jobs["native-linux"]?.strategy?.matrix).includes("needs.metadata.outputs.linux_matrix"), "Linux matrix must be metadata-derived");
check(String(jobs["native-portable"]?.strategy?.matrix).includes("needs.metadata.outputs.portable_matrix"), "portable matrix must be metadata-derived");
check(String(jobs["sealed-candidate-e2e"]?.strategy?.matrix).includes("needs.metadata.outputs.e2e_matrix"), "E2E matrix must be metadata-derived");
check(action.inputs?.validation_node_versions?.required === true, "target consumer versions must be passed from manifest authority");
check(actionText.includes("JSON.parse(process.argv[1])") && actionText.includes("inputs.validation_node_versions"), "target consumers must iterate the manifest-derived Node versions");

for (const command of ["bun run contracts:check", "bun run native:check", "bun run licenses:check", "bun run typecheck", "bun run test", "bun run test:release-pipeline", "bun run conformance:judge", "bun run build", "cargo fmt --all --check", "cargo clippy --locked --workspace --all-targets -- -D warnings"]) {
  check(hasRun(jobs.deterministic, command), `deterministic candidate gate is missing ${command}`);
}
for (const command of ["cargo build --locked --release --target", "assemble-native-package.mjs", "assemble-cli-archive.mjs", "test-native-consumer.mjs", "write-release-target-provenance.mjs"]) {
  check(actionText.includes(command), `target builder is missing ${command}`);
}
check(!actionText.includes("jq "), "cross-platform target action must not assume jq is installed");
check(actionText.includes("npm install --global npm@11.6.2") && hasRun(jobs["root-package"], "npm install --global npm@11.6.2"), "all npm packaging must pin 11.6.2 on Node 24");
const candidateSteps = Object.values(jobs).flatMap((job) => job?.steps ?? []);
const releaseSteps = Object.values(release.jobs ?? {}).flatMap((job) => job?.steps ?? []);
const actionSteps = action.runs?.steps ?? [];
for (const [scope, steps] of [["candidate", candidateSteps], ["release", releaseSteps], ["target action", actionSteps]]) {
  const nodeSteps = steps.filter(({ uses }) => String(uses).startsWith("actions/setup-node@"));
  check(nodeSteps.length > 0 && nodeSteps.every((step) => String(step.with?.["node-version"]) === manifest.release.toolchain.node), `${scope} Node setup must match native-targets.json`);
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
check(!actionSteps.some(({ run }) => String(run).includes("${{ inputs.candidate_ref }}")), "target action must pass the candidate ref through the environment rather than shell template expansion");

check(hasRun(jobs.aggregate, "write-release-checksums.mjs --candidate"), "aggregate must checksum all publishable assets");
check(hasRun(jobs.aggregate, "validate-release-artifacts.mjs --candidate"), "aggregate must run full candidate-aware artifact validation");
check(hasRun(jobs.aggregate, "write-release-candidate-manifest.mjs --sha \"$CANDIDATE_SHA\" --output dist/release/artifact-manifest.json"), "aggregate must write the raw artifact manifest to its canonical path");
check(hasRun(jobs.aggregate, "--artifact-manifest dist/release/artifact-manifest.json --output dist/release/candidate.json"), "candidate validator must turn the raw manifest into the proof-bearing candidate receipt");
const aggregateUpload = (jobs.aggregate?.steps ?? []).find(({ id }) => id === "upload");
check(equal(paths(aggregateUpload), ["dist/cli/*.tar.gz", "dist/cli/SHA256SUMS", "dist/installers/install.ps1", "dist/installers/install.sh", "dist/native/*.tgz", "dist/provenance/provenance.json", "dist/release/artifact-manifest.json", "dist/release/candidate.json", "dist/root/*.tgz"].sort()), "sealed candidate upload must contain the raw manifest, proof-bearing receipt, and only canonical artifacts");
const e2e = jobs["sealed-candidate-e2e"];
check(hasInput(e2e, "artifact-ids") && hasRun(e2e, "test-release-candidate-consumer.mjs"), "every native E2E must download the aggregate by ID and consume it");
const e2eConsumer = (e2e?.steps ?? []).find(({ run }) => String(run).includes("test-release-candidate-consumer.mjs"));
check(String(e2eConsumer?.env?.KASB_CANDIDATE_SHA).includes("needs.metadata.outputs.sha"), "sealed native E2E must compare the receipt with the checked-out PR head rather than GitHub's merge SHA");
for (const evidence of ["candidateReceiptFile", "candidateRoot", "installers", "receiptBytes", '["upgrade", "--check"]', '["upgrade"]', "same-version ${operation} must not change the managed binary", "same-version ${operation} must not change the managed receipt"]) {
  check(consumerText.includes(evidence), `sealed candidate consumer is missing ${evidence}`);
}
check(!/\b(?:cargo build|npm pack|bun run build)\b/u.test(consumerText), "sealed candidate consumer must never rebuild");

check(equal(Object.keys(release.on ?? {}), ["push"]) && equal(release.on?.push?.tags, ["v*"]), "publication must be canonical-tag-only");
check(release.permissions?.contents === "read" && release.concurrency?.["cancel-in-progress"] === false, "publication defaults must be read-only and non-cancelling");
const releaseJobs = release.jobs ?? {};
const preflight = releaseJobs["publication-state"];
check(preflight?.environment === "github-release" && equal(preflight.permissions, { contents: "read" }), "immutability preflight must run read-only inside github-release");
const appSteps = (job) => (job?.steps ?? []).filter(({ uses }) => String(uses).startsWith("actions/create-github-app-token@"));
const validatePolicyAppStep = (step, jobName) => {
  check(step?.uses === "actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1", `${jobName} must pin create-github-app-token v3`);
  check(step?.with?.["permission-administration"] === "read" && step?.with?.["permission-contents"] === "read", `${jobName} release-policy App token must be administration/read and contents/read only`);
  check(String(step?.with?.["client-id"]).includes("KASB_RELEASE_APP_CLIENT_ID") && String(step?.with?.["private-key"]).includes("KASB_RELEASE_APP_PRIVATE_KEY"), `${jobName} release-policy App credentials must use the documented variable and secret`);
};
check(appSteps(preflight).length === 1, "immutability preflight must mint exactly one release-policy App token");
validatePolicyAppStep(appSteps(preflight)[0], "immutability preflight");
check(hasRun(preflight, "github-release:v1"), "immutability preflight must require the environment-only GitHub sentinel");
check(releaseJobs.candidate?.uses === "./.github/workflows/candidate.yml" && releaseJobs.candidate?.with?.mode === "strict", "tag workflow must invoke the strict reusable candidate");

check(releaseJobs["github-release"]?.environment === "github-release" && equal(releaseJobs["github-release"]?.permissions, { contents: "write" }), "GitHub executor must be the sole contents:write job");
check(releaseJobs["npm-release"]?.environment === "npm-release" && equal(releaseJobs["npm-release"]?.permissions, { contents: "read", "id-token": "write" }), "npm executor must use protected OIDC trusted publishing");
check(appSteps(releaseJobs["github-release"]).length === 1, "GitHub executor must mint exactly one fresh release-policy App token");
validatePolicyAppStep(appSteps(releaseJobs["github-release"])[0], "GitHub executor");
check(appSteps(releaseJobs["npm-release"]).length === 0, "npm executor must not mint a release-policy App token");
check(hasRun(releaseJobs["github-release"], "github-release:v1"), "GitHub executor must require the environment-only sentinel");
check(hasRun(releaseJobs["npm-release"], "npm-release:v1"), "npm executor must require the environment-only sentinel");
for (const [name, channel] of [["github-release", "github"], ["npm-release", "npm"]]) {
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
}
for (const name of ["github-release", "npm-release"]) {
  check(hasInput(releaseJobs[name], "artifact-ids"), `${name} must consume the exact candidate artifact by ID`);
  check(hasRun(releaseJobs[name], "--artifact-manifest dist/release/artifact-manifest.json") && hasRun(releaseJobs[name], "--output dist/release/candidate.json"), `${name} must revalidate the raw manifest into the default planner candidate path`);
  check(!hasAnyRun(releaseJobs[name], /\b(?:cargo build|npm pack|bun run build)\b/u), `${name} must never rebuild`);
  check(hasRun(releaseJobs[name], "execute-release-publication.mjs"), `${name} must invoke the tested deterministic executor`);
}
check(!releaseText.includes("gh release") && !releaseText.includes("npm publish"), "workflow YAML must not duplicate publication mutation logic");
check(releaseText.includes("KASB_RELEASE_POLICY_TOKEN: ${{ steps.release-policy-token.outputs.token }}") && executorText.includes("KASB_RELEASE_POLICY_TOKEN"), "GitHub executor must use the fresh read-only App token for live policy rereads");
check(!releaseText.includes("--immutability-confirmation"), "publication must not trust an unauthenticated immutability confirmation file");
check(!releaseText.includes("(?:sha256:)"), "workflow digest validation must use portable Bash ERE syntax");
check(releaseText.includes("--verify-immutable-release-only true") && hasRun(releaseJobs["npm-release"], "plan-github-publication.mjs"), "npm must reverify the exact immutable release using contents:read only");
check(releaseText.includes("npm install --global npm@11.6.2"), "npm inspection and publishing CLI must be pinned to 11.6.2");
check((releaseJobs["github-release"]?.steps ?? []).some((step) => step.if === "always()" && String(step.uses).startsWith("actions/upload-artifact@")), "GitHub receipt must upload on failure");
check((releaseJobs["npm-release"]?.steps ?? []).some((step) => step.if === "always()" && String(step.uses).startsWith("actions/upload-artifact@")), "npm receipt must upload on failure");
check(executorText.includes("executeGitHubPublication") && executorText.includes("executeNpmPublication"), "production CLI must use the deterministically tested executors");
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
