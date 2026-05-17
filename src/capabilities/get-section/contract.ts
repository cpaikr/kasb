import { Schema } from "effect";

import {
  assertNoUnknownKeys,
  assertObjectInput,
  readOptionalString,
  readRequiredString,
} from "../request-validation.ts";
import { InvalidCapabilityRequest } from "../types.ts";
import { ResultMetadataSchema } from "../types.ts";

const fields = new Set(["stdNum", "indexDocumentId", "ref", "keyword"]);

export const GetSectionRequestSchema = Schema.Struct({
  stdNum: Schema.String.pipe(Schema.minLength(1)),
  indexDocumentId: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
  ref: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
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
  const indexDocumentId = readOptionalString(input, "indexDocumentId");
  const ref = readOptionalString(input, "ref");
  if (indexDocumentId === undefined && ref === undefined) {
    throw new InvalidCapabilityRequest({
      parameter: "indexDocumentId",
      message: "필수 매개변수 \"indexDocumentId\" 또는 \"ref\" 중 하나가 필요합니다.",
    });
  }
  if (indexDocumentId !== undefined && ref !== undefined) {
    throw new InvalidCapabilityRequest({
      parameter: "ref",
      message: "매개변수 \"indexDocumentId\"와 \"ref\"는 동시에 사용할 수 없습니다.",
    });
  }
  return {
    stdNum: readRequiredString(input, "stdNum"),
    ...(indexDocumentId === undefined ? {} : { indexDocumentId }),
    ...(ref === undefined ? {} : { ref }),
    ...(keyword === undefined ? {} : { keyword }),
  };
};

export const SectionClauseSchema = Schema.Struct({
  kind: Schema.Literal("paragraph", "title", "unknown"),
  title: Schema.optional(Schema.String),
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
      ref: Schema.optional(Schema.String),
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
        "ambiguous_ref_resolved",
        "empty_section",
        "partial_clause_normalization",
        "source_html_preserved",
      ),
      message: Schema.String,
    }),
  ),
});
export type GetSectionResult = typeof GetSectionResultSchema.Type;
