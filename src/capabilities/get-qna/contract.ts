import { Schema } from "effect";

import {
  assertNoUnknownKeys,
  assertObjectInput,
  readOptionalString,
  readRequiredString,
} from "../request-validation.ts";
import { ResultMetadataSchema } from "../types.ts";

const fields = new Set(["docNumber", "keyword"]);

export const GetQnaRequestSchema = Schema.Struct({
  docNumber: Schema.String.pipe(Schema.minLength(1)),
  keyword: Schema.optional(Schema.String),
});
export type GetQnaRawInput = typeof GetQnaRequestSchema.Encoded;
export type GetQnaRequest = typeof GetQnaRequestSchema.Type;

export const resolveGetQnaRequest = (
  input: Partial<GetQnaRawInput> & Record<string, unknown>,
): GetQnaRequest => {
  assertObjectInput(input);
  assertNoUnknownKeys(input, fields);
  const keyword = readOptionalString(input, "keyword");
  return {
    docNumber: readRequiredString(input, "docNumber"),
    ...(keyword === undefined ? {} : { keyword }),
  };
};

export const QnaSchema = Schema.Struct({
  docNumber: Schema.String,
  id: Schema.optional(Schema.Number),
  type: Schema.Number,
  title: Schema.String,
  reference: Schema.optional(Schema.String),
  fullContent: Schema.String,
  contentHtml: Schema.optional(Schema.String),
  relStds: Schema.optional(Schema.String),
  tags: Schema.Array(Schema.String),
  contentLink: Schema.optional(Schema.String),
  publishDate: Schema.optional(Schema.String),
  deprecated: Schema.Boolean,
  prevDocNumber: Schema.optional(Schema.String),
  nextDocNumber: Schema.optional(Schema.String),
});
export type Qna = typeof QnaSchema.Type;

export const GetQnaResultSchema = Schema.Struct({
  result: Schema.Struct({
    request: GetQnaRequestSchema,
    qna: QnaSchema,
  }),
  metadata: ResultMetadataSchema,
  references: Schema.Struct({
    docNumber: Schema.String,
    qnaUrl: Schema.String,
  }),
  warnings: Schema.Array(
    Schema.Struct({
      code: Schema.Literal("source_html_preserved", "source_metadata_incomplete"),
      message: Schema.String,
    }),
  ),
});
export type GetQnaResult = typeof GetQnaResultSchema.Type;
