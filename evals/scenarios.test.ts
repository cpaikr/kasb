import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  kasbScenarioEvals,
  runKasbScenarioEval,
  runKasbScenarioEvals,
  type KasbScenarioDiagnosticArea,
} from "./scenarios.ts";

const repoRoot = join(import.meta.dir, "..");
const originalFetch = globalThis.fetch;
const diagnosticAreas = new Set<KasbScenarioDiagnosticArea>([
  "naming",
  "schema",
  "output_shape",
  "source_behavior",
  "fixture_or_runner",
]);

const readFixture = (path: string): unknown =>
  JSON.parse(readFileSync(join(repoRoot, path), "utf8"));

const makeFixtureMap = (): Map<string, unknown> => new Map([
  ["/api/standard?searchWord=%EB%A6%AC%EC%8A%A4", readFixture("fixtures/kasb/search-standards-lease.json")],
  ["/api/standard-indexes/1116", readFixture("fixtures/kasb/standard-indexes-1116.json")],
  ["/api/paragraphs/1116/ZB2hJW", readFixture("fixtures/kasb/section-1116-ZB2hJW.json")],
  ["/api/paragraphs/1116/19970f", { status: 200, clauses: [], mainTitle: null }],
  ["/api/paragraphs/content/1116/23", readFixture("fixtures/kasb/paragraph-1116-23.json")],
  ["/api/paragraphs/content/1116/B3", readFixture("fixtures/kasb/paragraph-1116-B3.json")],
  ["/api/qnas/v2?types=11%2C12%2C13%2C14%2C15%2C24%2C25&searchWord=%EB%A6%AC%EC%8A%A4&page=1&rows=5", readFixture("fixtures/kasb/search-qna-lease.json")],
  ["/api/qnas/v2/SSI-35629", readFixture("fixtures/kasb/qna-SSI-35629.json")],
]);

const useFixtureMap = (fixtureByPath: Map<string, unknown>): void => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const key = `${url.pathname}${url.search}`;
    const payload = fixtureByPath.get(key);
    if (payload === undefined) {
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }
    return { ok: true, status: 200, json: async () => payload } as Response;
  }) as typeof fetch;
};

beforeEach(() => {
  useFixtureMap(makeFixtureMap());
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("KASB scenario evals", () => {
  test("define realistic tuning and held-out workflow scenarios", () => {
    expect(kasbScenarioEvals.map((scenario) => scenario.id)).toEqual([
      "lease-standard-structure-paragraph-23",
      "lease-purpose-section-paragraphs-1-2",
      "lease-qna-search-and-fetch",
      "compare-lease-paragraphs-23-and-b3",
      "recover-from-title-document-id",
    ]);
    expect(kasbScenarioEvals.some((scenario) => scenario.category === "tuning")).toBe(true);
    expect(kasbScenarioEvals.some((scenario) => scenario.category === "held-out")).toBe(true);
    expect(kasbScenarioEvals.every((scenario) => scenario.successCriteria.length > 0)).toBe(true);

    const assertions = kasbScenarioEvals.flatMap((scenario) => scenario.assess([]).assertions);
    expect(assertions.every((assertion) => diagnosticAreas.has(assertion.diagnosticArea))).toBe(true);
  });

  test("run all scenario evals against deterministic fixtures", async () => {
    const runs = await runKasbScenarioEvals();

    expect(runs).toHaveLength(kasbScenarioEvals.length);
    expect(runs.every((run) => run.metrics.taskSuccess)).toBe(true);
    expect(runs.every((run) => run.metrics.toolCallCount > 0)).toBe(true);
    expect(runs.every((run) => run.metrics.outputBytes > 0)).toBe(true);
    expect(runs.every((run) => run.metrics.referenceFieldCount > 0)).toBe(true);
  });

  test("expose diagnostic areas on failed assertions", async () => {
    const fixtureByPath = makeFixtureMap();
    fixtureByPath.delete("/api/standard?searchWord=%EB%A6%AC%EC%8A%A4");
    useFixtureMap(fixtureByPath);
    const scenario = kasbScenarioEvals.find((item) => item.id === "lease-standard-structure-paragraph-23");
    expect(scenario).toBeDefined();

    const run = await runKasbScenarioEval(scenario!);
    const failedDiagnosticAreas = run.assessment.assertions
      .filter((assertion) => !assertion.passed)
      .map((assertion) => assertion.diagnosticArea);

    expect(run.metrics.taskSuccess).toBe(false);
    expect(failedDiagnosticAreas.length).toBeGreaterThan(0);
    expect(failedDiagnosticAreas.every((area) => diagnosticAreas.has(area))).toBe(true);
    expect(failedDiagnosticAreas).toContain("source_behavior");
  });

  test("track recovery metrics for wrong titleDocumentId scenarios", async () => {
    const scenario = kasbScenarioEvals.find((item) => item.id === "recover-from-title-document-id");
    expect(scenario).toBeDefined();

    const run = await runKasbScenarioEval(scenario!);

    expect(run.metrics).toMatchObject({
      taskSuccess: true,
      toolCallCount: 3,
      failedToolCallCount: 1,
      invalidCallCount: 0,
      retryCallCount: 2,
      unexpectedFailureCount: 0,
    });
    expect(run.outcomes[0]?.status).toBe("failure");
    expect(run.outcomes[0]?.expectationMet).toBe(true);
    expect(run.assessment.assertions.every((assertion) => assertion.passed)).toBe(true);
  });
});
