import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalCandidateIdentity, validateArtifactManifest, validatePrebuildPublicationState, validatePublicationStateSource } from "./release-candidate-contract.mjs";
import { repositoryRoot } from "./release-contract.mjs";

const options = parseArgs(process.argv.slice(2));
const identity = await canonicalCandidateIdentity(options);
assertCheckout(identity, options.skipCheckoutValidation);
assertGeneratedState(options.skipCheckoutValidation);

let publicationState = JSON.parse(await readFile(resolve(repositoryRoot, options.publicationState), "utf8"));
validatePublicationStateSource(identity.mode, publicationState);
if (identity.mode === "rehearsal") publicationState = hydratePublicationState(publicationState, identity);

let candidate = { ...identity, phase: "identity" };
if (options.artifactManifest) {
  const manifest = JSON.parse(await readFile(resolve(repositoryRoot, options.artifactManifest), "utf8"));
  candidate = await validateArtifactManifest(identity, manifest);
  candidate.publicationStateSource = publicationState.source;
  const { validatePublicationStateSnapshot } = await import("./release-publication-contract.mjs");
  validatePublicationStateSnapshot(candidate, publicationState);
} else {
  await validatePrebuildPublicationState(identity, publicationState);
}

candidate.publicationStateSource = publicationState.source;
const output = resolve(repositoryRoot, options.output);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(candidate, null, 2)}\n`);
console.log(`${identity.mode} ${candidate.phase} candidate metadata is valid at ${options.output}`);

function parseArgs(args) {
  const parsed = { output: "dist/release/candidate.json", skipCheckoutValidation: false };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--skip-checkout-validation") {
      parsed.skipCheckoutValidation = true;
      continue;
    }
    if (!["--mode", "--ref", "--sha", "--publication-state", "--artifact-manifest", "--output"].includes(flag)) {
      throw new Error(`unknown candidate metadata option ${flag}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    parsed[flag.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = value;
    index += 1;
  }
  for (const required of ["mode", "ref", "sha", "publicationState"]) {
    if (!parsed[required]) throw new Error(`--${required.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)} is required`);
  }
  if (parsed.skipCheckoutValidation && process.env.KASB_CANDIDATE_TEST_ALLOW_SKIP_CHECKOUT !== "1") {
    throw new Error("--skip-checkout-validation is reserved for deterministic self-tests");
  }
  return parsed;
}

function assertCheckout(identity, skip) {
  if (skip) return;
  const head = command("git", ["rev-parse", "HEAD"]);
  if (head.status !== 0 || head.stdout.trim() !== identity.commit) throw new Error("candidate SHA differs from the checked-out commit");
  if (identity.mode === "strict") {
    const tagged = command("git", ["rev-parse", `${identity.sourceRef}^{commit}`]);
    if (tagged.status !== 0 || tagged.stdout.trim() !== identity.commit) throw new Error("strict release tag does not resolve to the candidate commit");
  }
}

function assertGeneratedState(skip) {
  if (skip) return;
  for (const args of [
    ["scripts/generate-native-packages.mjs", "--check"],
    ["scripts/generate-release-assets.mjs", "--check"],
  ]) {
    const result = command("node", args);
    if (result.status !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || `${args[0]} failed`);
  }
  for (const args of [["diff", "--quiet"], ["diff", "--cached", "--quiet"]]) {
    if (command("git", args).status !== 0) throw new Error("candidate checkout has tracked changes");
  }
}

function hydratePublicationState(value, identity) {
  if (value === "__CANDIDATE_SHA__") return identity.commit;
  if (value === "__CANDIDATE_TAG__") return identity.canonicalTag;
  if (value === "__CANDIDATE_VERSION__") return identity.version;
  if (Array.isArray(value)) return value.map((entry) => hydratePublicationState(entry, identity));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, hydratePublicationState(entry, identity)]));
  }
  return value;
}

function command(executable, args) {
  return spawnSync(executable, args, { cwd: repositoryRoot, encoding: "utf8" });
}
