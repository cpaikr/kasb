import { performance } from "node:perf_hooks";

import {
  defaultKasbTypedEvalTools,
  executeKasbTypedEvalTool,
  type KasbTypedEvalTool,
  type KasbTypedEvalToolName,
} from "./typed-tools.ts";
import type { GetParagraphResult } from "../src/capabilities/get-paragraph/contract.ts";
import type { GetQnaResult } from "../src/capabilities/get-qna/contract.ts";
import type { GetSectionResult } from "../src/capabilities/get-section/contract.ts";
import type { GetStandardStructureResult } from "../src/capabilities/get-standard-structure/contract.ts";
import type { SearchQnaResult } from "../src/capabilities/search-qna/contract.ts";
import type { SearchStandardsResult } from "../src/capabilities/search-standards/contract.ts";
import type { KasbFailureCode } from "../src/capabilities/types.ts";

export type KasbScenarioCategory = "tuning" | "held-out";
export type KasbScenarioDiagnosticArea = "naming" | "schema" | "output_shape" | "source_behavior" | "fixture_or_runner";

export type KasbScenarioStep = {
  readonly id: string;
  readonly tool: KasbTypedEvalToolName;
  readonly input: Record<string, unknown>;
  readonly purpose: string;
  readonly retryAfterStepId?: string;
  readonly expectFailure?: {
    readonly code: KasbFailureCode;
    readonly parameter?: string;
  };
};

export type KasbScenarioAssertion = {
  readonly title: string;
  readonly diagnosticArea: KasbScenarioDiagnosticArea;
  readonly passed: boolean;
  readonly detail: string;
};

export type KasbScenarioAssessment = {
  readonly success: boolean;
  readonly summary: string;
  readonly assertions: readonly KasbScenarioAssertion[];
};

export type KasbScenarioEval = {
  readonly id: string;
  readonly category: KasbScenarioCategory;
  readonly task: string;
  readonly successCriteria: readonly string[];
  readonly steps: readonly KasbScenarioStep[];
  readonly assess: (outcomes: readonly KasbScenarioStepOutcome[]) => KasbScenarioAssessment;
};

export type KasbScenarioFailure = {
  readonly code?: string;
  readonly message: string;
  readonly parameter?: string;
  readonly retryable?: boolean;
  readonly sourceUrl?: string;
};

export type KasbScenarioStepOutcome = {
  readonly step: KasbScenarioStep;
  readonly runtimeMs: number;
  readonly outputBytes: number;
} & (
  | {
    readonly status: "success";
    readonly output: unknown;
    readonly expectationMet: boolean;
  }
  | {
    readonly status: "failure";
    readonly failure: KasbScenarioFailure;
    readonly expectationMet: boolean;
  }
);

export type KasbScenarioMetrics = {
  readonly taskSuccess: boolean;
  readonly toolCallCount: number;
  readonly failedToolCallCount: number;
  readonly invalidCallCount: number;
  readonly retryCallCount: number;
  readonly unexpectedFailureCount: number;
  readonly runtimeMs: number;
  readonly outputBytes: number;
  readonly referenceFieldCount: number;
};

export type KasbScenarioRun = {
  readonly scenarioId: string;
  readonly category: KasbScenarioCategory;
  readonly task: string;
  readonly metrics: KasbScenarioMetrics;
  readonly assessment: KasbScenarioAssessment;
  readonly outcomes: readonly KasbScenarioStepOutcome[];
};

const assess = (
  summary: string,
  assertions: readonly KasbScenarioAssertion[],
): KasbScenarioAssessment => ({
  success: assertions.every((assertion) => assertion.passed),
  summary,
  assertions,
});

const successOutput = <Result>(
  outcomes: readonly KasbScenarioStepOutcome[],
  stepId: string,
): Result | undefined => {
  const outcome = outcomes.find((item) => item.step.id === stepId);
  return outcome?.status === "success" ? outcome.output as Result : undefined;
};

const failureOutput = (
  outcomes: readonly KasbScenarioStepOutcome[],
  stepId: string,
): KasbScenarioFailure | undefined => {
  const outcome = outcomes.find((item) => item.step.id === stepId);
  return outcome?.status === "failure" ? outcome.failure : undefined;
};

export const kasbScenarioEvals: readonly KasbScenarioEval[] = [
  {
    id: "lease-standard-structure-paragraph-23",
    category: "tuning",
    task: "Search 리스, identify standard 1116, retrieve its structure, then cite paragraph 23.",
    successCriteria: [
      "standard search returns K-IFRS 1116 as an available match",
      "structure retrieval exposes section identifiers for standard 1116",
      "paragraph 23 returns a citeable uniqueKey and source URL",
    ],
    steps: [
      {
        id: "search-lease-standards",
        tool: "search-standards",
        input: { keyword: "리스", limit: 40 },
        purpose: "Find the lease standard among source-ranked standard search results.",
      },
      {
        id: "get-1116-structure",
        tool: "get-standard-structure",
        input: { stdNum: "1116" },
        purpose: "Expose retrieval-facing section ids before exact content lookup.",
      },
      {
        id: "get-1116-23",
        tool: "get-paragraph",
        input: { stdNum: "1116", paraNum: "23" },
        purpose: "Fetch the target paragraph by stable citation fields.",
      },
    ],
    assess: (outcomes) => {
      const search = successOutput<SearchStandardsResult>(outcomes, "search-lease-standards");
      const structure = successOutput<GetStandardStructureResult>(outcomes, "get-1116-structure");
      const paragraph = successOutput<GetParagraphResult>(outcomes, "get-1116-23");
      return assess("Lease standard discovery reaches a citeable paragraph result.", [
        {
          title: "search identifies 1116",
          diagnosticArea: "source_behavior",
          passed: search?.result.standards.some((standard) => standard.stdNum === "1116") === true,
          detail: "search-standards should include stdNum 1116 when the result window is large enough.",
        },
        {
          title: "structure exposes section ids",
          diagnosticArea: "output_shape",
          passed: structure?.result.sections.some((section) => section.indexDocumentId === "ZB2hJW") === true,
          detail: "get-standard-structure should expose retrieval-facing indexDocumentId values.",
        },
        {
          title: "paragraph 23 is citeable",
          diagnosticArea: "output_shape",
          passed: paragraph?.references.uniqueKey === "1116-23" && paragraph.references.paragraphUrl.length > 0,
          detail: "get-paragraph should return stdNum, paraNum, uniqueKey, indexDocumentId, and source URL references.",
        },
      ]);
    },
  },
  {
    id: "lease-purpose-section-paragraphs-1-2",
    category: "tuning",
    task: "Retrieve the section containing paragraphs 1 and 2 of K-IFRS 1116.",
    successCriteria: [
      "structure retrieval finds the 1~2 목적 section",
      "section retrieval returns paragraph clauses 1 and 2",
      "the resolved section reference includes indexDocumentId ZB2hJW",
    ],
    steps: [
      {
        id: "get-1116-structure",
        tool: "get-standard-structure",
        input: { stdNum: "1116" },
        purpose: "Find the section node whose ref covers paragraphs 1 and 2.",
      },
      {
        id: "get-purpose-by-ref",
        tool: "get-section",
        input: { stdNum: "1116", ref: "1~2" },
        purpose: "Fetch the section through the public ref locator when indexDocumentId is not yet known.",
      },
    ],
    assess: (outcomes) => {
      const structure = successOutput<GetStandardStructureResult>(outcomes, "get-1116-structure");
      const section = successOutput<GetSectionResult>(outcomes, "get-purpose-by-ref");
      return assess("Purpose-section lookup returns the expected paragraph range.", [
        {
          title: "structure contains 1~2 ref",
          diagnosticArea: "output_shape",
          passed: structure?.result.sections.some((item) => item.ref === "1~2" && item.indexDocumentId === "ZB2hJW") === true,
          detail: "The structure should provide a public ref and retrieval id for the 목적 section.",
        },
        {
          title: "section resolves to ZB2hJW",
          diagnosticArea: "output_shape",
          passed: section?.references.indexDocumentId === "ZB2hJW",
          detail: "Ref-based get-section calls should return the resolved indexDocumentId.",
        },
        {
          title: "section includes paragraphs 1 and 2",
          diagnosticArea: "output_shape",
          passed: section?.result.clauses.map((clause) => clause.paraNum).join(",") === "1,2",
          detail: "The returned clauses should preserve ordered paragraph references for citation.",
        },
      ]);
    },
  },
  {
    id: "lease-qna-search-and-fetch",
    category: "tuning",
    task: "Find Q&A documents about 리스 and fetch a cited docNumber.",
    successCriteria: [
      "Q&A search returns docNumber values usable by get-qna",
      "get-qna fetches SSI-35629 with title, tags, and source references",
    ],
    steps: [
      {
        id: "search-lease-qna",
        tool: "search-qna",
        input: { keyword: "리스", rows: 5 },
        purpose: "Find lease Q&A document numbers.",
      },
      {
        id: "get-ssi-35629",
        tool: "get-qna",
        input: { docNumber: "SSI-35629" },
        purpose: "Retrieve a full Q&A document by a cited search result docNumber.",
      },
    ],
    assess: (outcomes) => {
      const search = successOutput<SearchQnaResult>(outcomes, "search-lease-qna");
      const qna = successOutput<GetQnaResult>(outcomes, "get-ssi-35629");
      return assess("Q&A search-to-detail flow preserves the document citation.", [
        {
          title: "search returns SSI-35629",
          diagnosticArea: "source_behavior",
          passed: search?.result.items.some((item) => item.docNumber === "SSI-35629") === true,
          detail: "search-qna should surface complete docNumber values for follow-up retrieval.",
        },
        {
          title: "Q&A detail matches docNumber",
          diagnosticArea: "output_shape",
          passed: qna?.references.docNumber === "SSI-35629" && qna.result.qna.title.includes("리스"),
          detail: "get-qna should return the requested Q&A document and preserve source references.",
        },
      ]);
    },
  },
  {
    id: "compare-lease-paragraphs-23-and-b3",
    category: "held-out",
    task: "Compare paragraphs 23 and B3 without browser navigation.",
    successCriteria: [
      "both paragraphs are fetched directly by stdNum and paraNum",
      "both outputs include uniqueKey and parent indexDocumentId references",
      "no browser-route identifiers are required",
    ],
    steps: [
      {
        id: "get-1116-23",
        tool: "get-paragraph",
        input: { stdNum: "1116", paraNum: "23" },
        purpose: "Fetch the first paragraph for comparison by exact citation key.",
      },
      {
        id: "get-1116-b3",
        tool: "get-paragraph",
        input: { stdNum: "1116", paraNum: "B3" },
        purpose: "Fetch the appendix paragraph for comparison by exact citation key.",
      },
    ],
    assess: (outcomes) => {
      const paragraph23 = successOutput<GetParagraphResult>(outcomes, "get-1116-23");
      const paragraphB3 = successOutput<GetParagraphResult>(outcomes, "get-1116-b3");
      return assess("Direct paragraph lookup supports comparison without route navigation.", [
        {
          title: "paragraph 23 is direct",
          diagnosticArea: "schema",
          passed: paragraph23?.references.uniqueKey === "1116-23",
          detail: "Paragraph 23 should be retrievable without first fetching a browser route id.",
        },
        {
          title: "paragraph B3 is direct",
          diagnosticArea: "schema",
          passed: paragraphB3?.references.uniqueKey === "1116-B3",
          detail: "Appendix-style paragraph references should work through the same exact lookup.",
        },
        {
          title: "both carry parent section references",
          diagnosticArea: "output_shape",
          passed: Boolean(paragraph23?.references.indexDocumentId && paragraphB3?.references.indexDocumentId),
          detail: "Comparison outputs should include parent indexDocumentId fields for verification.",
        },
      ]);
    },
  },
  {
    id: "recover-from-title-document-id",
    category: "held-out",
    task: "Handle a wrong titleDocumentId by recovering through get-standard-structure.",
    successCriteria: [
      "the route-facing titleDocumentId fails clearly",
      "structure retrieval exposes the correct indexDocumentId",
      "a follow-up section call succeeds with the retrieval-facing id",
    ],
    steps: [
      {
        id: "bad-title-document-id",
        tool: "get-section",
        input: { stdNum: "1116", indexDocumentId: "19970f" },
        purpose: "Probe a common route-id mistake so the failure can guide recovery.",
        expectFailure: { code: "not_found" },
      },
      {
        id: "recover-with-structure",
        tool: "get-standard-structure",
        input: { stdNum: "1116" },
        purpose: "Recover by asking for retrieval-facing section ids.",
        retryAfterStepId: "bad-title-document-id",
      },
      {
        id: "retry-purpose-section",
        tool: "get-section",
        input: { stdNum: "1116", indexDocumentId: "ZB2hJW" },
        purpose: "Retry with the correct retrieval-facing id.",
        retryAfterStepId: "bad-title-document-id",
      },
    ],
    assess: (outcomes) => {
      const badIdFailure = failureOutput(outcomes, "bad-title-document-id");
      const structure = successOutput<GetStandardStructureResult>(outcomes, "recover-with-structure");
      const section = successOutput<GetSectionResult>(outcomes, "retry-purpose-section");
      return assess("Route-id recovery reaches a valid section result.", [
        {
          title: "wrong id fails with a route-id hint",
          diagnosticArea: "naming",
          passed: badIdFailure?.code === "not_found" && badIdFailure.message.includes("titleDocumentId"),
          detail: "The failure should distinguish browser titleDocumentId from retrieval indexDocumentId.",
        },
        {
          title: "structure exposes the recovery id",
          diagnosticArea: "output_shape",
          passed: structure?.result.sections.some((item) => item.indexDocumentId === "ZB2hJW") === true,
          detail: "The recovery path should discover the correct retrieval-facing id.",
        },
        {
          title: "retry succeeds",
          diagnosticArea: "source_behavior",
          passed: section?.references.indexDocumentId === "ZB2hJW" && section.result.clauses.length > 0,
          detail: "The final section call should return citeable content.",
        },
      ]);
    },
  },
];

export const runKasbScenarioEval = async (
  scenario: KasbScenarioEval,
  tools: readonly KasbTypedEvalTool[] = defaultKasbTypedEvalTools,
): Promise<KasbScenarioRun> => {
  const runStartedAt = performance.now();
  const outcomes: KasbScenarioStepOutcome[] = [];

  for (const step of scenario.steps) {
    const stepStartedAt = performance.now();
    try {
      const output = await executeKasbTypedEvalTool(tools, step.tool, step.input);
      const outcome: KasbScenarioStepOutcome = {
        step,
        status: "success",
        output,
        expectationMet: step.expectFailure === undefined,
        runtimeMs: performance.now() - stepStartedAt,
        outputBytes: jsonSize(output),
      };
      outcomes.push(outcome);
      if (!outcome.expectationMet) break;
    } catch (error) {
      const failure = normalizeFailure(error);
      const expectationMet = step.expectFailure !== undefined
        && failure.code === step.expectFailure.code
        && (step.expectFailure.parameter === undefined || failure.parameter === step.expectFailure.parameter);
      const outcome: KasbScenarioStepOutcome = {
        step,
        status: "failure",
        failure,
        expectationMet,
        runtimeMs: performance.now() - stepStartedAt,
        outputBytes: jsonSize(failure),
      };
      outcomes.push(outcome);
      if (!expectationMet) break;
    }
  }

  const assessment = scenario.assess(outcomes);
  const unexpectedFailureCount = outcomes.filter((outcome) => !outcome.expectationMet).length;
  const metrics: KasbScenarioMetrics = {
    taskSuccess: assessment.success && unexpectedFailureCount === 0,
    toolCallCount: outcomes.length,
    failedToolCallCount: outcomes.filter((outcome) => outcome.status === "failure").length,
    invalidCallCount: outcomes.filter((outcome) => outcome.status === "failure" && outcome.failure.code === "invalid_input").length,
    retryCallCount: outcomes.filter((outcome) => outcome.step.retryAfterStepId !== undefined).length,
    unexpectedFailureCount,
    runtimeMs: performance.now() - runStartedAt,
    outputBytes: outcomes.reduce((total, outcome) => total + outcome.outputBytes, 0),
    referenceFieldCount: outcomes.reduce((total, outcome) => {
      if (outcome.status !== "success") return total;
      return total + countReferenceFields(outcome.output);
    }, 0),
  };

  return {
    scenarioId: scenario.id,
    category: scenario.category,
    task: scenario.task,
    metrics,
    assessment,
    outcomes,
  };
};

export const runKasbScenarioEvals = async (
  scenarios: readonly KasbScenarioEval[] = kasbScenarioEvals,
  tools: readonly KasbTypedEvalTool[] = defaultKasbTypedEvalTools,
): Promise<readonly KasbScenarioRun[]> => {
  const runs: KasbScenarioRun[] = [];
  for (const scenario of scenarios) {
    runs.push(await runKasbScenarioEval(scenario, tools));
  }
  return runs;
};

const normalizeFailure = (error: unknown): KasbScenarioFailure => {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      ...(typeof record.code === "string" ? { code: record.code } : {}),
      message: typeof record.message === "string" ? record.message : String(error),
      ...(typeof record.parameter === "string" ? { parameter: record.parameter } : {}),
      ...(typeof record.retryable === "boolean" ? { retryable: record.retryable } : {}),
      ...(typeof record.sourceUrl === "string" ? { sourceUrl: record.sourceUrl } : {}),
    };
  }
  return { message: String(error) };
};

const jsonSize = (value: unknown): number => JSON.stringify(value)?.length ?? 0;

const countReferenceFields = (value: unknown): number => {
  if (value === null || typeof value !== "object") return 0;
  const record = value as Record<string, unknown>;
  const references = record.references;
  if (references === null || typeof references !== "object") return 0;
  return Object.values(references as Record<string, unknown>).filter((field) => {
    if (typeof field === "string") return field.length > 0;
    return field !== undefined && field !== null;
  }).length;
};
