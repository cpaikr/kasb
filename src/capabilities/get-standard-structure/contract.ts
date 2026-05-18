import { Schema } from "effect";

import {
  assertNoUnknownKeys,
  assertObjectInput,
  readOptionalString,
  readRequiredString,
} from "../request-validation.ts";
import {
  IndexDocumentIdSchema,
  ResultMetadataSchema,
  SourceUrlSchema,
  StdNumSchema,
} from "../types.ts";

const fields = new Set(["stdNum", "keyword"]);

export const GetStandardStructureRequestSchema = Schema.Struct({
  stdNum: StdNumSchema.annotations({
    description: "KASB standard number whose retrieval-facing section tree should be returned.",
    examples: ["1116"],
  }),
  keyword: Schema.optional(Schema.String.annotations({
    description: "Optional keyword for source-side structure search metadata; mapped to searchWord.",
    examples: ["리스"],
  })),
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
  indexDocumentId: IndexDocumentIdSchema,
  stdNum: StdNumSchema,
  title: Schema.String.annotations({
    description: "Section title as normalized from the KASB standard index.",
    examples: ["목적"],
  }),
  ref: Schema.String.annotations({
    description: "Section paragraph range or reference label that can be used with get-section --ref.",
    examples: ["1~2", "153~158"],
  }),
  level: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
    description: "Depth of this section node in the standard structure tree.",
    examples: [2],
  }),
  documentType: Schema.optional(Schema.String.annotations({
    description: "KASB source document type for non-body or special nodes when provided.",
    examples: ["overview"],
  })),
  parentDocumentIds: Schema.Array(IndexDocumentIdSchema).annotations({
    description: "Ancestor retrieval-facing section ids from the KASB index tree.",
  }),
  sort: Schema.optional(Schema.Number.annotations({
    description: "Source ordering value for stable display when provided.",
    examples: [1],
  })),
}).annotations({ description: "One retrieval-facing section node from get-standard-structure." });
export type StandardSectionNode = typeof StandardSectionNodeSchema.Type;

export const GetStandardStructureResultSchema = Schema.Struct({
  result: Schema.Struct({
    request: GetStandardStructureRequestSchema.annotations({ description: "Normalized request that produced this result." }),
    sections: Schema.Array(StandardSectionNodeSchema).annotations({
      description: "Section nodes whose indexDocumentId values can be passed to get-section.",
    }),
    returnedCount: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
      description: "Number of section nodes included in this response.",
      examples: [120],
    }),
  }).annotations({ description: "Standard structure payload." }),
  metadata: ResultMetadataSchema,
  references: Schema.Struct({
    stdNum: StdNumSchema,
    structureUrl: SourceUrlSchema,
  }).annotations({ description: "Operation-level source reference for the standard structure." }),
  warnings: Schema.Array(
    Schema.Struct({
      code: Schema.Literal("search_filtered_structure", "source_metadata_incomplete"),
      message: Schema.String.annotations({ description: "Human-readable warning detail." }),
    }),
  ),
});
export type GetStandardStructureResult = typeof GetStandardStructureResultSchema.Type;
