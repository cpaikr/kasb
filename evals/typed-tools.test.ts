import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  createKasbTypedEvalTools,
  defaultKasbTypedEvalTools,
  executeKasbTypedEvalTool,
} from "./typed-tools.ts";
import { defaultGetSectionOperation } from "../src/app/get-section.ts";
import { defaultSearchStandardsOperation } from "../src/app/search-standards.ts";
import type { KasbFailure } from "../src/capabilities/types.ts";

const repoRoot = join(import.meta.dir, "..");
const originalFetch = globalThis.fetch;

const readFixture = (path: string): unknown =>
  JSON.parse(readFileSync(join(repoRoot, path), "utf8"));

const makeFixtureMap = (): Map<string, unknown> => new Map([
  ["/api/standard?searchWord=%EB%A6%AC%EC%8A%A4", readFixture("fixtures/kasb/search-standards-lease.json")],
  ["/api/standard-indexes/1017", { standardIndexes: [] }],
  ["/api/standard-indexes/1116", readFixture("fixtures/kasb/standard-indexes-1116.json")],
  ["/api/paragraphs/1116/ZB2hJW", readFixture("fixtures/kasb/section-1116-ZB2hJW.json")],
  ["/api/paragraphs/content/1116/23", readFixture("fixtures/kasb/paragraph-1116-23.json")],
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

type SharedEnvelope = {
  readonly result: unknown;
  readonly metadata: unknown;
  readonly references: unknown;
  readonly warnings: readonly unknown[];
};

const propertyNames = (schema: unknown) =>
  Object.keys((schema as { readonly properties?: Record<string, unknown> }).properties ?? {}).sort();

const asSharedEnvelope = (value: unknown): SharedEnvelope => {
  expect(value).toBeObject();
  expect(Object.keys(value as Record<string, unknown>).sort()).toEqual([
    "metadata",
    "references",
    "result",
    "warnings",
  ]);
  expect((value as { readonly warnings?: unknown }).warnings).toBeArray();
  return value as SharedEnvelope;
};

beforeEach(() => {
  useFixtureMap(makeFixtureMap());
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("internal typed eval tools", () => {
  test("defines one internal typed tool per app operation", () => {
    const tools = defaultKasbTypedEvalTools;

    expect(tools.map((tool) => tool.name)).toEqual([
      "kasb_search_standards",
      "kasb_get_standard_structure",
      "kasb_get_section",
      "kasb_get_paragraph",
      "kasb_search_qna",
      "kasb_get_qna",
    ]);
    expect(new Set(tools.map((tool) => tool.name)).size).toBe(tools.length);
    expect(tools.every((tool) => tool.description.length > 0)).toBe(true);
    expect(tools.find((tool) => tool.name === "kasb_get_section")?.description).toContain("exactly one of indexDocumentId/ref");
    expect(tools.find((tool) => tool.name === "kasb_get_section")?.description).toContain("titleDocumentId");
    expect(tools.find((tool) => tool.name === "kasb_search_standards")?.description).toContain("keyword");
    expect(tools.find((tool) => tool.name === "kasb_search_standards")?.description).toContain("query");
    expect(tools.find((tool) => tool.name === "kasb_search_qna")?.description).toContain("rows instead of CLI --limit");
  });

  test("maps definitions directly to app-layer schemas and executors", () => {
    const tools = createKasbTypedEvalTools();
    const searchStandards = tools.find((tool) => tool.name === "kasb_search_standards");
    const getSection = tools.find((tool) => tool.name === "kasb_get_section");

    expect(searchStandards?.inputJsonSchema).toBe(defaultSearchStandardsOperation.inputJsonSchema);
    expect(searchStandards?.resultJsonSchema).toBe(defaultSearchStandardsOperation.resultJsonSchema);
    expect(searchStandards?.execute).toBe(defaultSearchStandardsOperation.execute);
    expect(getSection?.inputJsonSchema).toBe(defaultGetSectionOperation.inputJsonSchema);
    expect(getSection?.resultJsonSchema).toBe(defaultGetSectionOperation.resultJsonSchema);
    expect(getSection?.execute).toBe(defaultGetSectionOperation.execute);
  });

  test("keeps typed parameters separate from CLI flag syntax", async () => {
    const getSection = defaultKasbTypedEvalTools.find((tool) => tool.name === "kasb_get_section");

    expect(propertyNames(getSection?.inputJsonSchema ?? {})).toEqual([
      "indexDocumentId",
      "keyword",
      "ref",
      "stdNum",
    ]);
    expect(propertyNames(getSection?.inputJsonSchema ?? {})).not.toContain("std-num");

    await expect(
      executeKasbTypedEvalTool(defaultKasbTypedEvalTools, "kasb_get_paragraph", {
        "std-num": "1116",
        "para-num": "23",
      }),
    ).rejects.toMatchObject({
      code: "invalid_input",
      parameter: "std-num",
    } satisfies Partial<KasbFailure>);
  });

  test("executes every typed tool through app operations and returns shared envelopes", async () => {
    const smokeCases = [
      {
        name: "kasb_search_standards",
        input: { keyword: "리스", limit: 1 },
        assertEnvelope: (envelope: SharedEnvelope) => {
          expect((envelope.result as { readonly returnedCount: number }).returnedCount).toBe(1);
        },
      },
      {
        name: "kasb_get_standard_structure",
        input: { stdNum: "1116" },
        assertEnvelope: (envelope: SharedEnvelope) => {
          expect((envelope.references as { readonly stdNum: string }).stdNum).toBe("1116");
        },
      },
      {
        name: "kasb_get_section",
        input: { stdNum: "1116", indexDocumentId: "ZB2hJW" },
        assertEnvelope: (envelope: SharedEnvelope) => {
          expect((envelope.references as { readonly indexDocumentId: string }).indexDocumentId).toBe("ZB2hJW");
        },
      },
      {
        name: "kasb_get_paragraph",
        input: { stdNum: "1116", paraNum: "23" },
        assertEnvelope: (envelope: SharedEnvelope) => {
          expect((envelope.references as { readonly paraNum: string }).paraNum).toBe("23");
        },
      },
      {
        name: "kasb_search_qna",
        input: { keyword: "리스", rows: 5 },
        assertEnvelope: (envelope: SharedEnvelope) => {
          expect((envelope.result as { readonly returnedCount: number }).returnedCount).toBeGreaterThan(0);
        },
      },
      {
        name: "kasb_get_qna",
        input: { docNumber: "SSI-35629" },
        assertEnvelope: (envelope: SharedEnvelope) => {
          expect((envelope.references as { readonly docNumber: string }).docNumber).toBe("SSI-35629");
        },
      },
    ] as const;

    for (const smokeCase of smokeCases) {
      const result = await executeKasbTypedEvalTool(
        defaultKasbTypedEvalTools,
        smokeCase.name,
        smokeCase.input,
      );

      smokeCase.assertEnvelope(asSharedEnvelope(result));
    }
  });
});
