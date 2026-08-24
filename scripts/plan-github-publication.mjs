import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  planGitHubPublication,
  validatePublicationStateEnvelope,
} from "./release-publication-contract.mjs";
import { failureReport, parseOptions, readJson, required, writeReport } from "./release-publication-cli.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
let outputPath = resolve(repositoryRoot, "dist/release/github-publication-plan.json");

try {
  const options = parseOptions(
    process.argv.slice(2),
    ["--candidate", "--state", "--output", "--phase"],
    "Usage: node scripts/plan-github-publication.mjs --state <snapshot.json> [--phase stage|finalize|verify] [--candidate <metadata.json>] [--output <report.json>]",
  );
  outputPath = resolve(repositoryRoot, options.output ?? "dist/release/github-publication-plan.json");
  const candidatePath = resolve(repositoryRoot, options.candidate ?? "dist/release/candidate.json");
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
