import { describe, expect, test } from "bun:test";
import type { AnySchema } from "ajv";
import Ajv2020 from "ajv/dist/2020.js";

import {
  defaultGetSectionOperation,
  defaultSearchStandardsOperation,
} from "../packages/node/src/default-operations.ts";
import { fixtureKasbAppOperations } from "./fixture-operations.ts";
import {
  createKasbTypedEvalTools,
  defaultKasbTypedEvalTools,
  executeKasbTypedEvalTool,
} from "./typed-tools.ts";

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

describe("internal Rust-backed Node eval tools", () => {
  test("defines one internal typed tool per Node SDK operation", () => {
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

  test("maps definitions directly to Node-owned schemas and Rust-backed executors", () => {
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

  test("keeps typed parameters separate from CLI flag syntax", () => {
    const getSection = defaultKasbTypedEvalTools.find((tool) => tool.name === "kasb_get_section");
    expect(propertyNames(getSection?.inputJsonSchema ?? {})).toEqual([
      "indexDocumentId",
      "keyword",
      "ref",
      "stdNum",
    ]);
    expect(propertyNames(getSection?.inputJsonSchema ?? {})).not.toContain("std-num");
  });

  test("executes every typed tool through caller-owned deterministic operations", async () => {
    const tools = createKasbTypedEvalTools(fixtureKasbAppOperations);
    const smokeCases = [
      ["kasb_search_standards", { keyword: "리스", limit: 1 }],
      ["kasb_get_standard_structure", { stdNum: "1116" }],
      ["kasb_get_section", { stdNum: "1116", indexDocumentId: "ZB2hJW" }],
      ["kasb_get_paragraph", { stdNum: "1116", paraNum: "23" }],
      ["kasb_search_qna", { keyword: "리스", rows: 5 }],
      ["kasb_get_qna", { docNumber: "SSI-35629" }],
    ] as const;
    const ajv = new Ajv2020({ strict: false });

    for (const [name, input] of smokeCases) {
      const output = await executeKasbTypedEvalTool(tools, name, input);
      asSharedEnvelope(output);
      const resultSchema = tools.find((tool) => tool.name === name)?.resultJsonSchema;
      expect(resultSchema).toBeDefined();
      expect(ajv.compile(resultSchema as AnySchema)(output)).toBe(true);
    }
  });
});
