import { join } from "node:path";

import {
  executeConformanceRunner,
  readConformanceJson,
  type ConformanceCase,
  type ConformanceRoute,
} from "../../../../conformance/judge.ts";

export {
  canonicalizeConformanceOutcome,
  findConformanceDifference,
  judgeConformanceCase,
  judgeKnownBadControls,
  readConformanceJson,
  readConformanceManifest,
  readKnownBadManifest,
  serializeConformanceOutcome,
  type ConformanceCase,
  type ConformanceDifference,
  type ConformanceManifest,
  type ConformanceOperationName,
  type ConformanceRoute,
  type DifferenceKind,
  type KnownBadManifest,
} from "../../../../conformance/judge.ts";

export const conformanceRequestUrl = (input: RequestInfo | URL): URL =>
  new URL(input instanceof Request ? input.url : String(input));

export const installFixtureFetch = (
  repoRoot: string,
  routes: readonly ConformanceRoute[],
): { readonly restore: () => void; readonly undeclaredRequests: string[] } => {
  const originalFetch = globalThis.fetch;
  const undeclaredRequests: string[] = [];
  const fixtureByUrl = new Map(
    routes.map((route) => [
      new URL(route.requestUrl).href,
      readConformanceJson(repoRoot, route.fixture),
    ]),
  );

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const requestUrl = conformanceRequestUrl(input).href;
    if (!fixtureByUrl.has(requestUrl)) {
      undeclaredRequests.push(requestUrl);
      throw new Error(`Conformance case made an undeclared source request: ${requestUrl}`);
    }
    const payload = structuredClone(fixtureByUrl.get(requestUrl));
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

export const executeConformanceCase = async (
  repoRoot: string,
  testCase: ConformanceCase,
): Promise<unknown> => executeConformanceRunner(repoRoot, {
  name: "typescript",
  command: [process.execPath, "run", join(import.meta.dir, "runner.ts")],
  cwd: repoRoot,
}, testCase);
