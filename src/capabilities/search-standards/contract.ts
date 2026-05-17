import { Schema } from "effect";

import {
  assertNoUnknownKeys,
  assertObjectInput,
  readOptionalInteger,
  readRequiredString,
} from "../request-validation.ts";
import { ResultMetadataSchema } from "../types.ts";

const fields = new Set(["keyword", "limit"]);

export const SearchStandardsRequestSchema = Schema.Struct({
  keyword: Schema.String.pipe(Schema.minLength(1)).annotations({
    description: "KASB standards search keyword, mapped to source searchWord.",
  }),
  limit: Schema.optionalWith(
    Schema.Int.pipe(Schema.greaterThanOrEqualTo(1), Schema.lessThanOrEqualTo(100)),
    { default: () => 20 },
  ).annotations({ description: "Maximum number of standards to return." }),
});
export type SearchStandardsRawInput = typeof SearchStandardsRequestSchema.Encoded;
export type SearchStandardsRequest = typeof SearchStandardsRequestSchema.Type;

export const resolveSearchStandardsRequest = (
  input: Partial<SearchStandardsRawInput> & Record<string, unknown>,
): SearchStandardsRequest => {
  assertObjectInput(input);
  assertNoUnknownKeys(input, fields);
  return {
    keyword: readRequiredString(input, "keyword"),
    limit: readOptionalInteger(input, "limit", { defaultValue: 20, min: 1, max: 100 }),
  };
};

export const SearchStandardItemSchema = Schema.Struct({
  stdNum: Schema.String,
  standardTitle: Schema.optional(Schema.String),
  standardKind: Schema.optional(Schema.String),
  matchCount: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)),
  references: Schema.Struct({ apiUrl: Schema.String }),
});
export type SearchStandardItem = typeof SearchStandardItemSchema.Type;

export const SearchStandardsResultSchema = Schema.Struct({
  result: Schema.Struct({
    request: SearchStandardsRequestSchema,
    totalMatchCount: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)),
    totalStandardCount: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)),
    returnedCount: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)),
    standards: Schema.Array(SearchStandardItemSchema),
    suggestedKeywords: Schema.Array(Schema.String),
  }),
  metadata: ResultMetadataSchema,
  references: Schema.Struct({ searchUrl: Schema.String }),
  warnings: Schema.Array(
    Schema.Struct({
      code: Schema.Literal("truncated_results", "source_metadata_incomplete"),
      message: Schema.String,
    }),
  ),
});
export type SearchStandardsResult = typeof SearchStandardsResultSchema.Type;
