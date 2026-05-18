import { Schema } from "effect";

import {
  assertNoUnknownKeys,
  assertObjectInput,
  readRequiredString,
} from "../request-validation.ts";
import {
  IndexDocumentIdSchema,
  ParaNumSchema,
  ResultMetadataSchema,
  SourceUrlSchema,
  StdNumSchema,
} from "../types.ts";

const fields = new Set(["stdNum", "paraNum"]);

export const GetParagraphRequestSchema = Schema.Struct({
  stdNum: StdNumSchema.annotations({
    description: "KASB standard number containing the paragraph to retrieve.",
    examples: ["1116"],
  }),
  paraNum: ParaNumSchema,
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
  stdNum: StdNumSchema,
  paraNum: ParaNumSchema,
  uniqueKey: Schema.String.annotations({
    description: "Derived paragraph key in the form {stdNum}-{paraNum}.",
    examples: ["1116-23"],
  }),
  indexDocumentId: IndexDocumentIdSchema.annotations({
    description: "Parent retrieval-facing section id returned by the source paragraph lookup when available.",
    examples: ["bdbwhT"],
  }),
  paraContent: Schema.String.annotations({
    description: "Source paragraph HTML fragment preserved for verification.",
  }),
  fullContent: Schema.String.annotations({
    description: "Plain-text paragraph content normalized from the source.",
  }),
  sort: Schema.optional(Schema.Number.annotations({
    description: "Source ordering value for the paragraph when provided.",
    examples: [23],
  })),
  faqDocNumbers: Schema.optional(Schema.String.annotations({
    description: "Source FAQ/Q&A document-number references associated with this paragraph when provided.",
    examples: ["SSI-35629"],
  })),
  faqCount: Schema.optional(Schema.Number.annotations({
    description: "Number of source FAQ/Q&A references associated with this paragraph when provided.",
    examples: [1],
  })),
}).annotations({ description: "Exact KASB paragraph result." });
export type Paragraph = typeof ParagraphSchema.Type;

export const GetParagraphResultSchema = Schema.Struct({
  result: Schema.Struct({
    request: GetParagraphRequestSchema.annotations({ description: "Normalized request that produced this result." }),
    paragraph: ParagraphSchema,
  }).annotations({ description: "Exact paragraph retrieval payload." }),
  metadata: ResultMetadataSchema,
  references: Schema.Struct({
    stdNum: StdNumSchema,
    paraNum: ParaNumSchema,
    uniqueKey: Schema.String.annotations({
      description: "Derived paragraph key in the form {stdNum}-{paraNum}.",
      examples: ["1116-23"],
    }),
    indexDocumentId: IndexDocumentIdSchema,
    paragraphUrl: SourceUrlSchema,
  }).annotations({ description: "Operation-level citation and source reference for the paragraph." }),
  warnings: Schema.Array(
    Schema.Struct({
      code: Schema.Literal("source_html_preserved", "paragraph_metadata_incomplete"),
      message: Schema.String.annotations({ description: "Human-readable warning detail." }),
    }),
  ),
});
export type GetParagraphResult = typeof GetParagraphResultSchema.Type;
