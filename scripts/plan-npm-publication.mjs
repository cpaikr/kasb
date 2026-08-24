import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  planNpmPublicationAfterGitHub,
} from "./release-publication-contract.mjs";
import { failureReport, parseOptions, readJson, required, writeReport } from "./release-publication-cli.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
let outputPath = resolve(repositoryRoot, "dist/release/npm-publication-plan.json");

try {
  const options = parseOptions(
    process.argv.slice(2),
    ["--candidate", "--state", "--output"],
    "Usage: node scripts/plan-npm-publication.mjs --state <snapshot.json> [--candidate <metadata.json>] [--output <report.json>]",
  );
  outputPath = resolve(repositoryRoot, options.output ?? "dist/release/npm-publication-plan.json");
  const candidatePath = resolve(repositoryRoot, options.candidate ?? "dist/release/candidate.json");
  const statePath = resolve(repositoryRoot, required(options.state, "--state is required"));
  const candidate = await readJson(candidatePath);
  const snapshot = await readJson(statePath);
  const report = { ok: true, ...planNpmPublicationAfterGitHub(candidate, snapshot) };
  await writeReport(outputPath, report);
  console.log(JSON.stringify(report));
} catch (error) {
  const report = failureReport("npm", error);
  await writeReport(outputPath, report);
  console.error(JSON.stringify(report));
  process.exitCode = 1;
}
