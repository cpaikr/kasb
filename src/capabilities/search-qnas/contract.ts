import { Schema } from "effect";

import {
  assertNoUnknownKeys,
  assertObjectInput,
  readOptionalInteger,
  readOptionalString,
  readRequiredString,
} from "../request-validation.ts";
import { ResultMetadataSchema } from "../types.ts";

const fields = new Set(["keyword", "page", "rows", "types"]);

export const SearchQnasRequestSchema = Schema.Struct({
  keyword: Schema.String.pipe(Schema.minLength(1)),
  page: Schema.optionalWith(
    Schema.Int.pipe(Schema.greaterThanOrEqualTo(1), Schema.lessThanOrEqualTo(1000)),
    { default: () => 1 },
  ),
  rows: Schema.optionalWith(
    Schema.Int.pipe(Schema.greaterThanOrEqualTo(1), Schema.lessThanOrEqualTo(50)),
    { default: () => 10 },
  ),
  types: Schema.optional(Schema.String),
});
export type SearchQnasRawInput = typeof SearchQnasRequestSchema.Encoded;
export type SearchQnasRequest = typeof SearchQnasRequestSchema.Type;

export const resolveSearchQnasRequest = (
  input: Partial<SearchQnasRawInput> & Record<string, unknown>,
): SearchQnasRequest => {
  assertObjectInput(input);
  assertNoUnknownKeys(input, fields);
  const types = readOptionalString(input, "types");
  return {
    keyword: readRequiredString(input, "keyword"),
    page: readOptionalInteger(input, "page", { defaultValue: 1, min: 1, max: 1000 }),
    rows: readOptionalInteger(input, "rows", { defaultValue: 10, min: 1, max: 50 }),
    ...(types === undefined ? {} : { types }),
  };
};

export const QnaSearchItemSchema = Schema.Struct({
  docNumber: Schema.String,
  type: Schema.Number,
  title: Schema.String,
  snippet: Schema.String,
  tags: Schema.Array(Schema.String),
  deprecated: Schema.Boolean,
  contentLink: Schema.optional(Schema.String),
  publishDate: Schema.optional(Schema.String),
  prefix: Schema.optional(Schema.String),
  references: Schema.Struct({ qnaUrl: Schema.String }),
});
export type QnaSearchItem = typeof QnaSearchItemSchema.Type;

export const SearchQnasResultSchema = Schema.Struct({
  result: Schema.Struct({
    request: SearchQnasRequestSchema,
    items: Schema.Array(QnaSearchItemSchema),
    returnedCount: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)),
    countByType: Schema.Record({ key: Schema.String, value: Schema.Number }),
  }),
  metadata: ResultMetadataSchema,
  references: Schema.Struct({ searchUrl: Schema.String }),
  warnings: Schema.Array(
    Schema.Struct({
      code: Schema.Literal("source_html_preserved", "source_metadata_incomplete"),
      message: Schema.String,
    }),
  ),
});
export type SearchQnasResult = typeof SearchQnasResultSchema.Type;
