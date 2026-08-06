import { readFileSync } from "node:fs";
import { join } from "node:path";

import { defaultGetParagraphOperation } from "../../src/app/get-paragraph.ts";
import { defaultGetQnaOperation } from "../../src/app/get-qna.ts";
import { defaultGetSectionOperation } from "../../src/app/get-section.ts";
import { defaultGetStandardStructureOperation } from "../../src/app/get-standard-structure.ts";
import { defaultSearchQnaOperation } from "../../src/app/search-qna.ts";
import { defaultSearchStandardsOperation } from "../../src/app/search-standards.ts";
import { KasbFailure } from "../../src/capabilities/types.ts";

export type ConformanceOperationName =
  | "search-standards"
  | "get-standard-structure"
  | "get-section"
  | "get-paragraph"
  | "search-qna"
  | "get-qna";

export type ConformanceRoute = {
  readonly requestPath: string;
  readonly fixture: string;
};

export type ConformanceCase = {
  readonly id: string;
  readonly operation: ConformanceOperationName;
  readonly input: Record<string, unknown>;
  readonly routes: readonly ConformanceRoute[];
  readonly expected: string;
};

export type ConformanceManifest = {
  readonly schemaVersion: 1;
  readonly contractVersion: "kasb-standards-v1";
  readonly canonicalization: {
    readonly replaceWithToken: readonly string[];
    readonly token: string;
  };
  readonly cases: readonly ConformanceCase[];
};

export type DifferenceKind = "type" | "value" | "missing-key" | "array-length";

export type ConformanceDifference = {
  readonly kind: DifferenceKind;
  readonly path: string;
  readonly expected: unknown;
  readonly actual: unknown;
};

type Operation = {
  readonly execute: (input: Record<string, unknown>) => Promise<unknown>;
};

const operations: Record<ConformanceOperationName, Operation> = {
  "search-standards": defaultSearchStandardsOperation,
  "get-standard-structure": defaultGetStandardStructureOperation,
  "get-section": defaultGetSectionOperation,
  "get-paragraph": defaultGetParagraphOperation,
  "search-qna": defaultSearchQnaOperation,
  "get-qna": defaultGetQnaOperation,
};

const readJson = <T>(repoRoot: string, path: string): T =>
  JSON.parse(readFileSync(join(repoRoot, path), "utf8")) as T;

export const readConformanceManifest = (repoRoot: string): ConformanceManifest =>
  readJson<ConformanceManifest>(repoRoot, "conformance/v1/cases.json");

export const readConformanceJson = (repoRoot: string, path: string): unknown =>
  readJson<unknown>(repoRoot, path);

export const serializeConformanceOutcome = (value: unknown): unknown => {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Conformance outcomes must serialize to a JSON value");
  }
  return JSON.parse(serialized) as unknown;
};

const installFixtureFetch = (
  repoRoot: string,
  routes: readonly ConformanceRoute[],
): { readonly restore: () => void; readonly undeclaredRequests: string[] } => {
  const originalFetch = globalThis.fetch;
  const undeclaredRequests: string[] = [];
  const fixtureByPath = new Map(
    routes.map((route) => [route.requestPath, readConformanceJson(repoRoot, route.fixture)]),
  );

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const requestPath = `${url.pathname}${url.search}`;
    if (!fixtureByPath.has(requestPath)) {
      undeclaredRequests.push(requestPath);
      throw new Error(`Conformance case made an undeclared source request: ${requestPath}`);
    }
    const payload = structuredClone(fixtureByPath.get(requestPath));
    return {
      ok: true,
      status: 200,
      json: async () => payload,
    } as Response;
  }) as typeof fetch;

  return {
    undeclaredRequests,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
};

const serializeFailure = (error: KasbFailure): Record<string, unknown> => ({
  code: error.code,
  message: error.message,
  retryable: error.retryable,
  ...(error.parameter === undefined ? {} : { parameter: error.parameter }),
  ...(error.sourceUrl === undefined ? {} : { sourceUrl: error.sourceUrl }),
});

export const executeConformanceCase = async (
  repoRoot: string,
  testCase: ConformanceCase,
): Promise<unknown> => {
  const fixtureFetch = installFixtureFetch(repoRoot, testCase.routes);
  try {
    let outcome: unknown;
    try {
      outcome = { ok: true, value: await operations[testCase.operation].execute(testCase.input) };
    } catch (error) {
      if (error instanceof KasbFailure) {
        outcome = { ok: false, error: serializeFailure(error) };
      } else {
        throw error;
      }
    }
    if (fixtureFetch.undeclaredRequests.length > 0) {
      throw new Error(
        `Conformance case ${testCase.id} made undeclared source requests: ${fixtureFetch.undeclaredRequests.join(", ")}`,
      );
    }
    return outcome;
  } finally {
    fixtureFetch.restore();
  }
};

const canonicalizeAtPath = (
  value: unknown,
  path: string,
  replacePaths: ReadonlySet<string>,
  token: string,
): unknown => {
  if (replacePaths.has(path)) return token;
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalizeAtPath(item, `${path}[${index}]`, replacePaths, token));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalizeAtPath(item, `${path}.${key}`, replacePaths, token)]),
    );
  }
  return value;
};

export const canonicalizeConformanceOutcome = (
  value: unknown,
  manifest: ConformanceManifest,
): unknown => canonicalizeAtPath(
  serializeConformanceOutcome(value),
  "$",
  new Set(manifest.canonicalization.replaceWithToken),
  manifest.canonicalization.token,
);

const typeOfJson = (value: unknown): string =>
  value === null ? "null" : Array.isArray(value) ? "array" : typeof value;

export const findConformanceDifference = (
  expected: unknown,
  actual: unknown,
  path = "$",
): ConformanceDifference | undefined => {
  const expectedType = typeOfJson(expected);
  const actualType = typeOfJson(actual);
  if (expectedType !== actualType) {
    return { kind: "type", path, expected, actual };
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      return { kind: "array-length", path, expected: expected.length, actual: actual.length };
    }
    for (let index = 0; index < expected.length; index += 1) {
      const difference = findConformanceDifference(expected[index], actual[index], `${path}[${index}]`);
      if (difference !== undefined) return difference;
    }
    return undefined;
  }

  if (expected !== null && actual !== null && expectedType === "object") {
    const expectedRecord = expected as Record<string, unknown>;
    const actualRecord = actual as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(expectedRecord), ...Object.keys(actualRecord)])].sort();
    for (const key of keys) {
      if (!(key in expectedRecord) || !(key in actualRecord)) {
        return { kind: "missing-key", path: `${path}.${key}`, expected: expectedRecord[key], actual: actualRecord[key] };
      }
      const difference = findConformanceDifference(expectedRecord[key], actualRecord[key], `${path}.${key}`);
      if (difference !== undefined) return difference;
    }
    return undefined;
  }

  return Object.is(expected, actual)
    ? undefined
    : { kind: "value", path, expected, actual };
};
