import { Schema } from "effect";

import {
  assertNoUnknownKeys,
  assertObjectInput,
  readOptionalString,
  readRequiredString,
} from "../request-validation.ts";
import { ResultMetadataSchema } from "../types.ts";

const fields = new Set(["stdNum", "keyword"]);

export const GetStandardStructureRequestSchema = Schema.Struct({
  stdNum: Schema.String.pipe(Schema.minLength(1)),
  keyword: Schema.optional(Schema.String),
});
export type GetStandardStructureRawInput = typeof GetStandardStructureRequestSchema.Encoded;
export type GetStandardStructureRequest = typeof GetStandardStructureRequestSchema.Type;

export const resolveGetStandardStructureRequest = (
  input: Partial<GetStandardStructureRawInput> & Record<string, unknown>,
): GetStandardStructureRequest => {
  assertObjectInput(input);
  assertNoUnknownKeys(input, fields);
  const keyword = readOptionalString(input, "keyword");
  return {
    stdNum: readRequiredString(input, "stdNum"),
    ...(keyword === undefined ? {} : { keyword }),
  };
};

export const StandardSectionNodeSchema = Schema.Struct({
  indexDocumentId: Schema.String,
  stdNum: Schema.String,
  title: Schema.String,
  ref: Schema.String,
  level: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)),
  documentType: Schema.optional(Schema.String),
  parentDocumentIds: Schema.Array(Schema.String),
  sort: Schema.optional(Schema.Number),
});
export type StandardSectionNode = typeof StandardSectionNodeSchema.Type;

export const GetStandardStructureResultSchema = Schema.Struct({
  result: Schema.Struct({
    request: GetStandardStructureRequestSchema,
    sections: Schema.Array(StandardSectionNodeSchema),
    returnedCount: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)),
  }),
  metadata: ResultMetadataSchema,
  references: Schema.Struct({
    stdNum: Schema.String,
    structureUrl: Schema.String,
  }),
  warnings: Schema.Array(
    Schema.Struct({
      code: Schema.Literal("search_filtered_structure", "source_metadata_incomplete"),
      message: Schema.String,
    }),
  ),
});
export type GetStandardStructureResult = typeof GetStandardStructureResultSchema.Type;
