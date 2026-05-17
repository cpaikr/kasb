import { Schema } from "effect";

import {
  assertNoUnknownKeys,
  assertObjectInput,
  readRequiredString,
} from "../request-validation.ts";
import { ResultMetadataSchema } from "../types.ts";

const fields = new Set(["stdNum", "paraNum"]);

export const GetParagraphRequestSchema = Schema.Struct({
  stdNum: Schema.String.pipe(Schema.minLength(1)),
  paraNum: Schema.String.pipe(Schema.minLength(1)),
});
export type GetParagraphRawInput = typeof GetParagraphRequestSchema.Encoded;
export type GetParagraphRequest = typeof GetParagraphRequestSchema.Type;

export const resolveGetParagraphRequest = (
  input: Partial<GetParagraphRawInput> & Record<string, unknown>,
): GetParagraphRequest => {
  assertObjectInput(input);
  assertNoUnknownKeys(input, fields);
  return {
    stdNum: readRequiredString(input, "stdNum"),
    paraNum: readRequiredString(input, "paraNum"),
  };
};

export const ParagraphSchema = Schema.Struct({
  stdNum: Schema.String,
  paraNum: Schema.String,
  uniqueKey: Schema.String,
  indexDocumentId: Schema.String,
  paraContent: Schema.String,
  fullContent: Schema.String,
  sort: Schema.optional(Schema.Number),
  faqDocNumbers: Schema.optional(Schema.String),
  faqCount: Schema.optional(Schema.Number),
});
export type Paragraph = typeof ParagraphSchema.Type;

export const GetParagraphResultSchema = Schema.Struct({
  result: Schema.Struct({
    request: GetParagraphRequestSchema,
    paragraph: ParagraphSchema,
  }),
  metadata: ResultMetadataSchema,
  references: Schema.Struct({
    stdNum: Schema.String,
    paraNum: Schema.String,
    uniqueKey: Schema.String,
    indexDocumentId: Schema.String,
    paragraphUrl: Schema.String,
  }),
  warnings: Schema.Array(
    Schema.Struct({
      code: Schema.Literal("source_html_preserved", "paragraph_metadata_incomplete"),
      message: Schema.String,
    }),
  ),
});
export type GetParagraphResult = typeof GetParagraphResultSchema.Type;
