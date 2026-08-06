import { describe, expect, test } from "bun:test";

import { defaultGetParagraphOperation } from "../../src/app/get-paragraph.ts";
import { defaultGetQnaOperation } from "../../src/app/get-qna.ts";
import { defaultGetSectionOperation } from "../../src/app/get-section.ts";
import { defaultGetStandardStructureOperation } from "../../src/app/get-standard-structure.ts";
import { defaultSearchQnaOperation } from "../../src/app/search-qna.ts";
import { defaultSearchStandardsOperation } from "../../src/app/search-standards.ts";

const operations = [
  {
    operation: defaultSearchStandardsOperation,
    requiredInput: ["keyword"],
    inputProperties: ["keyword", "limit", "sort"],
    resultProperties: ["result", "metadata", "references", "warnings"],
  },
  {
    operation: defaultGetStandardStructureOperation,
    requiredInput: ["stdNum"],
    inputProperties: ["stdNum", "keyword"],
    resultProperties: ["result", "metadata", "references", "warnings"],
  },
  {
    operation: defaultGetSectionOperation,
    requiredInput: ["stdNum"],
    inputProperties: ["stdNum", "indexDocumentId", "ref", "keyword"],
    resultProperties: ["result", "metadata", "references", "warnings"],
  },
  {
    operation: defaultGetParagraphOperation,
    requiredInput: ["stdNum", "paraNum"],
    inputProperties: ["stdNum", "paraNum"],
    resultProperties: ["result", "metadata", "references", "warnings"],
  },
  {
    operation: defaultSearchQnaOperation,
    requiredInput: ["keyword"],
    inputProperties: ["keyword", "page", "rows", "types", "sortDate", "from", "to"],
    resultProperties: ["result", "metadata", "references", "warnings"],
  },
  {
    operation: defaultGetQnaOperation,
    requiredInput: ["docNumber"],
    inputProperties: ["docNumber", "keyword"],
    resultProperties: ["result", "metadata", "references", "warnings"],
  },
] as const;

type JsonObjectSchema = {
  readonly $schema?: string;
  readonly type?: string;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly properties?: Record<string, unknown>;
  readonly description?: string;
  readonly examples?: readonly unknown[];
  readonly enum?: readonly unknown[];
  readonly pattern?: string;
  readonly oneOf?: readonly JsonObjectSchema[];
  readonly not?: JsonObjectSchema;
};

type JsonPropertySchema = JsonObjectSchema & {
  readonly items?: unknown;
};

const propertyNames = (schema: JsonObjectSchema) => Object.keys(schema.properties ?? {}).sort();

const asPropertySchema = (value: unknown): JsonPropertySchema => value as JsonPropertySchema;

const propertyAt = (schema: JsonObjectSchema, path: readonly string[]): JsonPropertySchema => {
  let current: JsonPropertySchema = schema;
  for (const segment of path) {
    const next = current.properties?.[segment];
    if (next === undefined) {
      throw new Error(`Missing schema property path: ${path.join(".")}`);
    }
    current = asPropertySchema(next);
  }
  return current;
};

const arrayItemsAt = (schema: JsonObjectSchema, path: readonly string[]): JsonPropertySchema => {
  const arraySchema = propertyAt(schema, path);
  if (arraySchema.items === undefined) {
    throw new Error(`Missing schema array items path: ${path.join(".")}`);
  }
  return asPropertySchema(arraySchema.items);
};

describe("capability JSON Schema exports", () => {
  for (const { operation, requiredInput, inputProperties, resultProperties } of operations) {
    test(`${operation.name} exposes stable input and result schemas`, () => {
      const inputSchema = operation.inputJsonSchema as JsonObjectSchema;
      const resultSchema = operation.resultJsonSchema as JsonObjectSchema;

      expect(inputSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(resultSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(inputSchema.type).toBe("object");
      expect(resultSchema.type).toBe("object");
      expect(inputSchema.additionalProperties).toBe(false);
      expect(resultSchema.additionalProperties).toBe(false);
      expect(inputSchema.required).toEqual(requiredInput);
      expect(propertyNames(inputSchema)).toEqual([...inputProperties].sort());
      expect(propertyNames(resultSchema)).toEqual([...resultProperties].sort());
    });

    test(`${operation.name} describes every input field with examples`, () => {
      const inputSchema = operation.inputJsonSchema as JsonObjectSchema;

      for (const property of inputProperties) {
        const propertySchema = asPropertySchema(inputSchema.properties?.[property]);
        expect(propertySchema.description).toBeString();
        expect(propertySchema.description?.length).toBeGreaterThan(0);
        expect(propertySchema.examples).toBeArray();
        expect(propertySchema.examples?.length).toBeGreaterThan(0);
      }
    });
  }

  test("identifier schemas explain KASB-specific ids and follow-up paths", () => {
    const getSectionInput = defaultGetSectionOperation.inputJsonSchema as JsonObjectSchema;
    const getParagraphInput = defaultGetParagraphOperation.inputJsonSchema as JsonObjectSchema;
    const getQnaInput = defaultGetQnaOperation.inputJsonSchema as JsonObjectSchema;
    const searchQnaInput = defaultSearchQnaOperation.inputJsonSchema as JsonObjectSchema;

    expect(getSectionInput.description).toContain("exactly one section locator");
    expect(propertyAt(getSectionInput, ["indexDocumentId"]).description).toContain("get-standard-structure");
    expect(propertyAt(getSectionInput, ["indexDocumentId"]).description).toContain("titleDocumentId");
    const stdNumPattern = propertyAt(getParagraphInput, ["stdNum"]).pattern;
    const paraNumPattern = propertyAt(getParagraphInput, ["paraNum"]).pattern;
    expect(stdNumPattern).toBeString();
    expect(paraNumPattern).toBeString();
    expect(new RegExp(stdNumPattern as string, "u").test(" . ")).toBe(false);
    expect(new RegExp(stdNumPattern as string, "u").test("11\n16")).toBe(true);
    expect(propertyAt(getParagraphInput, ["paraNum"]).examples).toEqual(["23", "한2.1", "B3", "BC240A"]);
    expect(new RegExp(paraNumPattern as string, "u").test("\u{FEFF}..\u{3000}")).toBe(false);
    expect(new RegExp(paraNumPattern as string, "u").test("2\n3")).toBe(true);
    expect(new RegExp(paraNumPattern as string, "u").test("22~30")).toBe(false);
    expect(propertyAt(getQnaInput, ["docNumber"]).examples).toEqual(["SSI-35629"]);
    const qnaTypes = propertyAt(searchQnaInput, ["types"]);
    expect(qnaTypes.description).toContain("11,12,13,14,15,24,25");
    expect(qnaTypes.description).toContain("numeric Q&A type id CSV");
    expect(qnaTypes.pattern).toBe("^\\s*(?:\\d+\\s*(?:,\\s*\\d+\\s*)*)?$");
    expect(propertyAt(searchQnaInput, ["sortDate"]).description).toContain("publishDate");
    expect(propertyAt(searchQnaInput, ["from"]).pattern).toBe("^\\d{4}-\\d{2}-\\d{2}$");
    expect(propertyAt(searchQnaInput, ["to"]).pattern).toBe("^\\d{4}-\\d{2}-\\d{2}$");
  });

  test("get-section input schema exposes the section-locator XOR rule", () => {
    const inputSchema = defaultGetSectionOperation.inputJsonSchema as JsonObjectSchema;

    expect(inputSchema.required).toEqual(["stdNum"]);
    expect(inputSchema.oneOf).toHaveLength(2);
    expect(inputSchema.oneOf?.[0]?.required).toEqual(["indexDocumentId"]);
    expect(inputSchema.oneOf?.[0]?.not?.required).toEqual(["ref"]);
    expect(inputSchema.oneOf?.[1]?.required).toEqual(["ref"]);
    expect(inputSchema.oneOf?.[1]?.not?.required).toEqual(["indexDocumentId"]);
  });

  test("important result fields carry descriptions for agent use", () => {
    const searchStandardsResult = defaultSearchStandardsOperation.resultJsonSchema as JsonObjectSchema;
    const getStructureResult = defaultGetStandardStructureOperation.resultJsonSchema as JsonObjectSchema;
    const getSectionResult = defaultGetSectionOperation.resultJsonSchema as JsonObjectSchema;
    const getParagraphResult = defaultGetParagraphOperation.resultJsonSchema as JsonObjectSchema;
    const searchQnaResult = defaultSearchQnaOperation.resultJsonSchema as JsonObjectSchema;

    expect(propertyAt(searchStandardsResult, ["result", "standards"]).description).toContain("get-standard-structure");
    expect(propertyAt(getStructureResult, ["result", "sections"]).description).toContain("indexDocumentId");
    expect(propertyAt(getSectionResult, ["references", "indexDocumentId"]).description).toContain("Retrieval-facing section id");
    expect(propertyAt(getParagraphResult, ["references", "uniqueKey"]).description).toContain("{stdNum}-{paraNum}");
    expect(propertyAt(searchQnaResult, ["result", "items"]).description).toContain("docNumber");
    expect(propertyAt(searchQnaResult, ["result", "suggestedKeywords"]).description).toContain("empty or too narrow");
  });

  test("search-standards result items expose the structure follow-up action schema", () => {
    const searchStandardsResult = defaultSearchStandardsOperation.resultJsonSchema as JsonObjectSchema;
    const standardItem = arrayItemsAt(searchStandardsResult, ["result", "standards"]);
    const nextActions = propertyAt(standardItem, ["nextActions"]);
    const getStandardStructure = propertyAt(nextActions, ["getStandardStructure"]);
    const operation = propertyAt(getStandardStructure, ["operation"]);
    const input = propertyAt(getStandardStructure, ["input"]);
    const stdNum = propertyAt(input, ["stdNum"]);

    expect(nextActions.type).toBe("object");
    expect(nextActions.required).toEqual(["getStandardStructure"]);
    expect(nextActions.additionalProperties).toBe(false);
    expect(nextActions.description).toContain("follow-up action");
    expect(getStandardStructure.type).toBe("object");
    expect(getStandardStructure.required).toEqual(["operation", "input"]);
    expect(getStandardStructure.additionalProperties).toBe(false);
    expect(getStandardStructure.description).toContain("Transport-neutral");
    expect(operation.enum).toEqual(["get-standard-structure"]);
    expect(input.type).toBe("object");
    expect(input.required).toEqual(["stdNum"]);
    expect(input.additionalProperties).toBe(false);
    expect(input.description).toContain("Typed input");
    expect(input.examples).toEqual([{ stdNum: "1116" }]);
    expect(stdNum.examples).toEqual(["1116"]);
  });
});
