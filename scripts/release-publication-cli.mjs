import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { PublicationContractError } from "./release-publication-contract.mjs";

export function parseOptions(args, acceptedFlags, usage) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!acceptedFlags.includes(name) || value === undefined) throw new Error(usage);
    options[name.slice(2)] = value;
  }
  return options;
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function writeReport(path, report) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
}

export function failureReport(channel, error) {
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

export function required(value, message) {
  if (!value) throw new Error(message);
  return value;
}
