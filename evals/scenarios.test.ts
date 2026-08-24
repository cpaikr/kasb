import { describe, expect, test } from "bun:test";

import { fixtureKasbAppOperations } from "./fixture-operations.ts";
import {
  kasbScenarioEvals,
  runKasbScenarioEval,
  runKasbScenarioEvals,
  type KasbScenarioDiagnosticArea,
} from "./scenarios.ts";
import { createKasbTypedEvalTools } from "./typed-tools.ts";

const diagnosticAreas = new Set<KasbScenarioDiagnosticArea>([
  "naming",
  "schema",
  "output_shape",
  "source_behavior",
  "fixture_or_runner",
]);
const fixtureTools = createKasbTypedEvalTools(fixtureKasbAppOperations);

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

  test("runs all workflow evals against caller-owned deterministic operations", async () => {
    const runs = await runKasbScenarioEvals(kasbScenarioEvals, fixtureTools);
    expect(runs).toHaveLength(kasbScenarioEvals.length);
    expect(runs.every((run) => run.metrics.taskSuccess)).toBe(true);
    expect(runs.every((run) => run.metrics.toolCallCount > 0)).toBe(true);
    expect(runs.every((run) => run.metrics.outputBytes > 0)).toBe(true);
    expect(runs.every((run) => run.metrics.referenceFieldCount > 0)).toBe(true);
  });

  test("exposes diagnostic areas on failed assertions", async () => {
    const brokenTools = createKasbTypedEvalTools({
      ...fixtureKasbAppOperations,
      searchStandards: {
        ...fixtureKasbAppOperations.searchStandards,
        execute: async () => {
          throw Object.assign(new Error("fixture route unavailable"), {
            code: "source_unavailable",
            retryable: true,
          });
        },
      },
    });
    const scenario = kasbScenarioEvals.find((item) => item.id === "lease-standard-structure-paragraph-23");
    expect(scenario).toBeDefined();

    const run = await runKasbScenarioEval(scenario!, brokenTools);
    const failedDiagnosticAreas = run.assessment.assertions
      .filter((assertion) => !assertion.passed)
      .map((assertion) => assertion.diagnosticArea);
    expect(run.metrics.taskSuccess).toBe(false);
    expect(failedDiagnosticAreas.length).toBeGreaterThan(0);
    expect(failedDiagnosticAreas.every((area) => diagnosticAreas.has(area))).toBe(true);
    expect(failedDiagnosticAreas).toContain("source_behavior");
  });

  test("tracks recovery metrics for wrong titleDocumentId scenarios", async () => {
    const scenario = kasbScenarioEvals.find((item) => item.id === "recover-from-title-document-id");
    expect(scenario).toBeDefined();
    const run = await runKasbScenarioEval(scenario!, fixtureTools);

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
