import { Schema } from "effect";

import {
  assertNoUnknownKeys,
  assertObjectInput,
  readOptionalString,
  readRequiredString,
} from "../request-validation.ts";
import { ResultMetadataSchema } from "../types.ts";

const fields = new Set(["stdNum", "indexDocumentId", "keyword"]);

export const GetSectionRequestSchema = Schema.Struct({
  stdNum: Schema.String.pipe(Schema.minLength(1)),
  indexDocumentId: Schema.String.pipe(Schema.minLength(1)),
  keyword: Schema.optional(Schema.String),
});
export type GetSectionRawInput = typeof GetSectionRequestSchema.Encoded;
export type GetSectionRequest = typeof GetSectionRequestSchema.Type;

export const resolveGetSectionRequest = (
  input: Partial<GetSectionRawInput> & Record<string, unknown>,
): GetSectionRequest => {
  assertObjectInput(input);
  assertNoUnknownKeys(input, fields);
  const keyword = readOptionalString(input, "keyword");
  return {
    stdNum: readRequiredString(input, "stdNum"),
    indexDocumentId: readRequiredString(input, "indexDocumentId"),
    ...(keyword === undefined ? {} : { keyword }),
  };
};

export const SectionClauseSchema = Schema.Struct({
  kind: Schema.Literal("paragraph", "title", "unknown"),
  uniqueKey: Schema.optional(Schema.String),
  stdNum: Schema.String,
  paraNum: Schema.optional(Schema.String),
  indexDocumentId: Schema.String,
  paraContent: Schema.optional(Schema.String),
  fullContent: Schema.optional(Schema.String),
  sort: Schema.optional(Schema.Number),
  faqDocNumbers: Schema.optional(Schema.String),
  faqCount: Schema.optional(Schema.Number),
});
export type SectionClause = typeof SectionClauseSchema.Type;

export const GetSectionResultSchema = Schema.Struct({
  result: Schema.Struct({
    request: GetSectionRequestSchema,
    section: Schema.Struct({
      stdNum: Schema.String,
      indexDocumentId: Schema.String,
      title: Schema.String,
      level: Schema.optional(Schema.Number),
      sort: Schema.optional(Schema.Number),
    }),
    clauses: Schema.Array(SectionClauseSchema),
  }),
  metadata: ResultMetadataSchema,
  references: Schema.Struct({
    stdNum: Schema.String,
    indexDocumentId: Schema.String,
    sectionUrl: Schema.String,
  }),
  warnings: Schema.Array(
    Schema.Struct({
      code: Schema.Literal(
        "empty_section",
        "partial_clause_normalization",
        "source_html_preserved",
      ),
      message: Schema.String,
    }),
  ),
});
export type GetSectionResult = typeof GetSectionResultSchema.Type;
