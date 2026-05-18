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
    inputProperties: ["keyword", "limit"],
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
    inputProperties: ["keyword", "page", "rows", "types"],
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
    expect(propertyAt(getParagraphInput, ["paraNum"]).examples).toEqual(["23", "한2.1", "B3", "BC240A"]);
    expect(propertyAt(getQnaInput, ["docNumber"]).examples).toEqual(["SSI-35629"]);
    expect(propertyAt(searchQnaInput, ["types"]).description).toContain("11,12,13,14,15,24,25");
    expect(propertyAt(searchQnaInput, ["types"]).description).toContain("numeric Q&A type id CSV");
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
  });
});
