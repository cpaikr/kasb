import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  planGitHubPublication,
  PublicationContractError,
  validatePublicationStateEnvelope,
} from "./release-publication-contract.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
let outputPath = resolve(repositoryRoot, "dist/release/github-publication-plan.json");

try {
  const options = parseOptions(process.argv.slice(2));
  outputPath = resolve(repositoryRoot, options.output ?? "dist/release/github-publication-plan.json");
  const candidatePath = resolve(repositoryRoot, options.candidate ?? "dist/release/candidate-metadata.json");
  const statePath = resolve(repositoryRoot, required(options.state, "--state is required"));
  const candidate = await readJson(candidatePath);
  const snapshot = await readJson(statePath);
  const validatedCandidate = validatePublicationStateEnvelope(candidate, snapshot);
  const report = { ok: true, ...planGitHubPublication(validatedCandidate, snapshot.github, options.phase ?? "stage") };
  await writeReport(outputPath, report);
  console.log(JSON.stringify(report));
} catch (error) {
  const report = failureReport("github", error);
  await writeReport(outputPath, report);
  console.error(JSON.stringify(report));
  process.exitCode = 1;
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!["--candidate", "--state", "--output", "--phase"].includes(name) || value === undefined) {
      throw new Error("Usage: node scripts/plan-github-publication.mjs --state <snapshot.json> [--phase stage|finalize|verify] [--candidate <metadata.json>] [--output <report.json>]");
    }
    options[name.slice(2)] = value;
  }
  return options;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeReport(path, report) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
}

function failureReport(channel, error) {
  return {
    schemaVersion: 1,
    ok: false,
    channel,
    error: {
      code: error instanceof PublicationContractError ? error.code : "unexpected_error",
      message: error instanceof Error ? error.message : String(error),
      ...(error instanceof PublicationContractError && error.details !== undefined ? { details: error.details } : {}),
    },
  };
}

function required(value, message) {
  if (!value) throw new Error(message);
  return value;
}
