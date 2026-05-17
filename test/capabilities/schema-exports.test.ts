import { describe, expect, test } from "bun:test";

import { defaultGetParagraphOperation } from "../../src/app/get-paragraph.ts";
import { defaultGetQnaOperation } from "../../src/app/get-qna.ts";
import { defaultGetSectionOperation } from "../../src/app/get-section.ts";
import { defaultGetStandardStructureOperation } from "../../src/app/get-standard-structure.ts";
import { defaultSearchQnasOperation } from "../../src/app/search-qnas.ts";
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
    requiredInput: ["stdNum", "indexDocumentId"],
    inputProperties: ["stdNum", "indexDocumentId", "keyword"],
    resultProperties: ["result", "metadata", "references", "warnings"],
  },
  {
    operation: defaultGetParagraphOperation,
    requiredInput: ["stdNum", "paraNum"],
    inputProperties: ["stdNum", "paraNum"],
    resultProperties: ["result", "metadata", "references", "warnings"],
  },
  {
    operation: defaultSearchQnasOperation,
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
};

const propertyNames = (schema: JsonObjectSchema) => Object.keys(schema.properties ?? {}).sort();

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
  }
});
