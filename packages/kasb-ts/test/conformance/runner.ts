import {
  type ConformanceOperationName,
  type ConformanceRunnerRequest,
} from "../../../../conformance/judge.ts";
import { defaultGetParagraphOperation } from "../../src/app/get-paragraph.ts";
import { defaultGetQnaOperation } from "../../src/app/get-qna.ts";
import { defaultGetSectionOperation } from "../../src/app/get-section.ts";
import { defaultGetStandardStructureOperation } from "../../src/app/get-standard-structure.ts";
import { defaultSearchQnaOperation } from "../../src/app/search-qna.ts";
import { defaultSearchStandardsOperation } from "../../src/app/search-standards.ts";
import { KasbFailure } from "../../src/capabilities/types.ts";

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

const serializeFailure = (error: KasbFailure): Record<string, unknown> => ({
  code: error.code,
  message: error.message,
  retryable: error.retryable,
  ...(error.parameter === undefined ? {} : { parameter: error.parameter }),
  ...(error.sourceUrl === undefined ? {} : { sourceUrl: error.sourceUrl }),
});

const readRequest = async (): Promise<ConformanceRunnerRequest> => {
  const raw = await Bun.stdin.text();
  const value = JSON.parse(raw) as ConformanceRunnerRequest;
  if (value.protocolVersion !== 1) {
    throw new Error(`Unsupported conformance protocol version: ${String(value.protocolVersion)}`);
  }
  return value;
};

const run = async (): Promise<void> => {
  const request = await readRequest();
  const originalFetch = globalThis.fetch;
  const undeclaredRequests: string[] = [];
  const fixtureByUrl = new Map(
    request.routes.map((route) => [new URL(route.requestUrl).href, route.payload]),
  );

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const requestUrl = new URL(input instanceof Request ? input.url : String(input)).href;
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

  try {
    let outcome: unknown;
    try {
      outcome = {
        ok: true,
        value: await operations[request.operation].execute(request.input),
      };
    } catch (error) {
      if (!(error instanceof KasbFailure)) throw error;
      outcome = { ok: false, error: serializeFailure(error) };
    }
    if (undeclaredRequests.length > 0) {
      throw new Error(
        `Conformance case ${request.caseId} made undeclared source requests: ${undeclaredRequests.join(", ")}`,
      );
    }
    process.stdout.write(`${JSON.stringify(outcome)}\n`);
  } finally {
    globalThis.fetch = originalFetch;
  }
};

await run();
