import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  canonicalizeConformanceOutcome,
  findConformanceDifference,
  readConformanceJson,
  readConformanceManifest,
  type ConformanceCase,
  type ConformanceManifest,
} from "./judge.ts";

export type CliSuccessCase = {
  readonly id: string;
  readonly semanticCase: string;
  readonly argv: readonly string[];
  readonly output: "structured" | "summary" | "raw";
};

export type CliProcessObservation = {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
};

export const cliSuccessCases: readonly CliSuccessCase[] = [
  {
    id: "search-standards-structured",
    semanticCase: "search-standards-success",
    argv: ["search-standards", "--keyword", "리스", "--limit", "1", "--sort", "match-count"],
    output: "structured",
  },
  {
    id: "get-standard-structure-structured",
    semanticCase: "get-standard-structure-success",
    argv: ["get-standard-structure", "--std-num", "1116", "--keyword", "리스"],
    output: "structured",
  },
  {
    id: "get-section-summary",
    semanticCase: "get-section-success",
    argv: ["get-section", "--std-num", "1116", "--index-document-id", "ZB2hJW", "--output", "summary"],
    output: "summary",
  },
  {
    id: "get-paragraph-pretty",
    semanticCase: "get-paragraph-success",
    argv: ["get-paragraph", "--std-num", "1116", "--para-num", "23", "--pretty"],
    output: "structured",
  },
  {
    id: "search-qna-summary-with-alias-precedence",
    semanticCase: "search-qna-success",
    argv: ["search-qna", "--keyword", "리스", "--rows", "40", "--limit", "5", "--output", "summary"],
    output: "summary",
  },
  {
    id: "get-qna-raw",
    semanticCase: "get-qna-success",
    argv: ["get-qna", "--doc-number", "SSI-35629", "--output", "raw"],
    output: "raw",
  },
  {
    id: "get-standard-structure-summary",
    semanticCase: "get-standard-structure-success",
    argv: ["get-standard-structure", "--std-num", "1116", "--keyword", "리스", "--output", "summary"],
    output: "summary",
  },
  {
    id: "get-qna-summary",
    semanticCase: "get-qna-success",
    argv: ["get-qna", "--doc-number", "SSI-35629", "--output", "summary"],
    output: "summary",
  },
];

export const createFixtureConfig = (
  repoRoot: string,
  testCase: ConformanceCase,
  directory: string,
  overrides: { readonly pending?: boolean; readonly readyPath?: string } = {},
): string => {
  const callsPath = join(directory, "calls.jsonl");
  const configPath = join(directory, "config.json");
  const routes = testCase.routes.map((route, index) => ({
    requestUrl: route.requestUrl,
    payload: readConformanceJson(repoRoot, route.fixture),
    ...(overrides.pending === true && index === 0 ? { pending: true } : {}),
  }));
  writeFileSync(configPath, `${JSON.stringify({
    routes,
    callsPath,
    ...(overrides.readyPath === undefined ? {} : { readyPath: overrides.readyPath }),
  })}\n`);
  return configPath;
};

export const readRecordedCalls = (path: string): readonly string[] => {
  try {
    return readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as string);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
};

export const expectedCliValue = (
  repoRoot: string,
  manifest: ConformanceManifest,
  cliCase: CliSuccessCase,
): unknown => {
  const semanticCase = requiredSemanticCase(manifest, cliCase.semanticCase);
  const outcome = readConformanceJson(repoRoot, semanticCase.expected) as {
    readonly ok: boolean;
    readonly value?: unknown;
  };
  if (outcome.ok !== true || outcome.value === undefined) {
    throw new Error(`${cliCase.semanticCase} is not a committed success outcome`);
  }
  const value = structuredClone(outcome.value) as Record<string, unknown>;
  if (semanticCase.operation === "search-standards") addSearchStandardCommands(value);
  if (cliCase.output === "summary") projectSummary(value, semanticCase.operation);
  return value;
};

export const canonicalizeCliValue = (
  value: unknown,
  manifest: ConformanceManifest,
): unknown => {
  const wrapped = canonicalizeConformanceOutcome({ ok: true, value }, manifest) as {
    readonly value: unknown;
  };
  return wrapped.value;
};

export const inspectCliProcess = (
  observation: CliProcessObservation,
  expectedValue: unknown,
  manifest: ConformanceManifest,
): readonly string[] => {
  const failures: string[] = [];
  if (observation.exitCode !== 0) failures.push(`exit:${String(observation.exitCode)}`);
  if (observation.signal !== null) failures.push(`signal:${observation.signal}`);
  if (observation.stderr !== "") failures.push("stderr:not-empty");
  failures.push(...inspectCliJsonFraming(observation.stdout));
  let actual: unknown;
  try {
    actual = JSON.parse(observation.stdout);
  } catch {
    failures.push("stdout:not-json");
    return failures;
  }
  const difference = findConformanceDifference(
    canonicalizeCliValue(expectedValue, manifest),
    canonicalizeCliValue(actual, manifest),
  );
  if (difference !== undefined) failures.push(`json:${difference.kind}:${difference.path}`);
  return failures;
};

export const inspectCliJsonFraming = (stdout: string): readonly string[] => {
  if (!stdout.endsWith("\n") || stdout.endsWith("\n\n")) {
    return ["stdout:newline-contract"];
  }
  const body = stdout.slice(0, -1);
  return body.trim() === body ? [] : ["stdout:json-boundary-whitespace"];
};

export const inspectCliFailureEnvelope = (value: unknown): readonly string[] => {
  if (!isRecord(value)) return ["failure-envelope:not-object"];
  const failures: string[] = [];
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([
    "failure", "metadata", "warnings",
  ])) {
    failures.push("failure-envelope:top-level-keys");
  }
  if (!Array.isArray(value.warnings) || value.warnings.length !== 0) {
    failures.push("failure-envelope:warnings");
  }
  return failures;
};

export const semanticCaseFor = (
  manifest: ConformanceManifest,
  cliCase: CliSuccessCase,
): ConformanceCase => requiredSemanticCase(manifest, cliCase.semanticCase);

export const loadManifest = (repoRoot: string): ConformanceManifest =>
  readConformanceManifest(repoRoot);

const requiredSemanticCase = (
  manifest: ConformanceManifest,
  id: string,
): ConformanceCase => {
  const testCase = manifest.cases.find((candidate) => candidate.id === id);
  if (testCase === undefined) throw new Error(`Missing semantic conformance case: ${id}`);
  return testCase;
};

const addSearchStandardCommands = (envelope: Record<string, unknown>): void => {
  const result = envelope.result as { standards: Array<Record<string, unknown>> };
  for (const standard of result.standards) {
    const action = (standard.nextActions as {
      getStandardStructure: { operation: string; input: { stdNum: string } };
    }).getStandardStructure;
    standard.nextCommands = {
      getStandardStructure: `kasb ${action.operation} --std-num ${shellQuote(action.input.stdNum)} --output summary`,
    };
  }
};

const projectSummary = (envelope: Record<string, unknown>, operation: string): void => {
  const result = envelope.result as Record<string, unknown>;
  if (operation === "get-standard-structure") {
    envelope.result = {
      request: result.request,
      returnedCount: result.returnedCount,
      sections: (result.sections as Array<Record<string, unknown>>).map((section) =>
        select(section, ["indexDocumentId", "title", "ref", "level", "documentType"])),
    };
  } else if (operation === "get-section") {
    envelope.result = {
      request: result.request,
      section: result.section,
      clauses: (result.clauses as Array<Record<string, unknown>>).map((clause) =>
        select(clause, ["kind", "title", "paraNum", "uniqueKey", "fullContent"])),
    };
  } else if (operation === "search-qna") {
    envelope.result = {
      request: result.request,
      returnedCount: result.returnedCount,
      totalCount: result.totalCount,
      totalPages: result.totalPages,
      hasNextPage: result.hasNextPage,
      paginationStatus: result.paginationStatus,
      countByType: result.countByType,
      typeLabels: result.typeLabels,
      suggestedKeywords: result.suggestedKeywords,
      items: (result.items as Array<Record<string, unknown>>).map((item) => ({
        ...select(item, ["docNumber", "type", "typeLabel", "title"]),
        snippet: truncate(String(item.snippet), 160),
        ...select(item, ["tags", "deprecated", "publishDate", "prefix"]),
      })),
    };
  } else if (operation === "get-qna") {
    const qna = result.qna as Record<string, unknown>;
    envelope.result = {
      request: result.request,
      qna: {
        ...select(qna, ["docNumber", "type", "typeLabel", "title"]),
        fullContentPreview: truncate(String(qna.fullContent), 1_000),
        ...select(qna, [
          "tags",
          "deprecated",
          "reference",
          "publishDate",
          "prevDocNumber",
          "nextDocNumber",
        ]),
      },
    };
  }
};

const select = (
  value: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> => Object.fromEntries(
  keys.flatMap((key) => key in value ? [[key, value[key]]] : []),
);

const truncate = (value: string, maxLength: number): string =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength).trimEnd()}…`;

const shellQuote = (value: string): string => /^[A-Za-z0-9._~:/@%+=,-]+$/u.test(value)
  ? value
  : `'${value.replaceAll("'", "'\\''")}'`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
