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

export const SearchQnaRequestSchema = Schema.Struct({
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
export type SearchQnaRawInput = typeof SearchQnaRequestSchema.Encoded;
export type SearchQnaRequest = typeof SearchQnaRequestSchema.Type;

export const resolveSearchQnaRequest = (
  input: Partial<SearchQnaRawInput> & Record<string, unknown>,
): SearchQnaRequest => {
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

export const SearchQnaResultSchema = Schema.Struct({
  result: Schema.Struct({
    request: SearchQnaRequestSchema,
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
export type SearchQnaResult = typeof SearchQnaResultSchema.Type;
