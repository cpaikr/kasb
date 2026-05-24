import { Schema } from "effect";

import {
  assertNoUnknownKeys,
  assertObjectInput,
  readOptionalString,
  readRequiredString,
} from "../request-validation.ts";
import { DocNumberSchema, InvalidCapabilityRequest, ResultMetadataSchema, SourceUrlSchema } from "../types.ts";

const fields = new Set(["docNumber", "keyword"]);

export const GetQnaRequestSchema = Schema.Struct({
  docNumber: DocNumberSchema,
  keyword: Schema.optional(Schema.String.annotations({
    description: "Optional keyword for source-side Q&A highlighting. Maps to searchWord.",
    examples: ["리스"],
  })),
});
export type GetQnaRawInput = typeof GetQnaRequestSchema.Encoded;
export type GetQnaRequest = typeof GetQnaRequestSchema.Type;

export const resolveGetQnaRequest = (
  input: Partial<GetQnaRawInput> & Record<string, unknown>,
): GetQnaRequest => {
  assertObjectInput(input);
  assertNoUnknownKeys(input, fields);
  const keyword = readOptionalString(input, "keyword");
  const docNumber = readRequiredString(input, "docNumber");
  if (/^\d+$/u.test(docNumber)) {
    throw new InvalidCapabilityRequest({
      parameter: "docNumber",
      message: "Parameter \"docNumber\" must be the full KASB Q&A document number. Numeric-only values are usually insufficient. Use search-qna to find the full docNumber (for example, SSI-35629), then pass it to get-qna.",
    });
  }
  return {
    docNumber,
    ...(keyword === undefined ? {} : { keyword }),
  };
};

export const QnaSchema = Schema.Struct({
  docNumber: DocNumberSchema,
  id: Schema.optional(Schema.Number.annotations({
    description: "Internal numeric source id when provided by the Q&A API. Use docNumber for public lookup.",
    examples: [4717],
  })),
  type: Schema.Number.annotations({
    description: "Source-facing Q&A type id.",
    examples: [15],
  }),
  typeLabel: Schema.String.annotations({
    description: "Observed human-readable Q&A type label derived from source type metadata.",
    examples: ["K-IFRS · 신속처리질의"],
  }),
  title: Schema.String.annotations({
    description: "Q&A document title normalized from source highlight text.",
    examples: ["리스 개시일과 계약일"],
  }),
  reference: Schema.optional(Schema.String.annotations({
    description: "Source reference text when provided by the Q&A document.",
  })),
  fullContent: Schema.String.annotations({
    description: "Plain-text Q&A body normalized from the source.",
  }),
  contentHtml: Schema.optional(Schema.String.annotations({
    description: "Source Q&A HTML body preserved for verification when returned by the API.",
  })),
  relStds: Schema.optional(Schema.String.annotations({
    description: "Source related-standards HTML fragment preserved when returned by the API.",
  })),
  tags: Schema.Array(Schema.String.annotations({
    description: "Source tag attached to the Q&A document.",
    examples: ["리스개시일"],
  })).annotations({ description: "Q&A source tag." }),
  contentLink: Schema.optional(Schema.String.annotations({
    description: "Content link provided by the source, when available. It can point outside the KASB JSON API.",
    examples: ["https://facility-qnas.s3.ap-northeast-2.amazonaws.com/kasb/quick/kifrs/html/35629.html"],
  })),
  publishDate: Schema.optional(Schema.String.annotations({
    description: "Source publication date string, when available.",
    examples: ["2019-12-23T15:00:00.000Z"],
  })),
  deprecated: Schema.Boolean.annotations({
    description: "Whether the source marks this Q&A document as deprecated or superseded.",
    examples: [false],
  }),
  prevDocNumber: Schema.optional(DocNumberSchema.annotations({
    description: "Previous adjacent Q&A document number provided by the source, when available.",
    examples: ["SSI-35627"],
  })),
  nextDocNumber: Schema.optional(DocNumberSchema.annotations({
    description: "Next adjacent Q&A document number provided by the source, when available.",
    examples: ["SSI-35628"],
  })),
}).annotations({ description: "Full Q&A document result." });
export type Qna = typeof QnaSchema.Type;

export const GetQnaResultSchema = Schema.Struct({
  result: Schema.Struct({
    request: GetQnaRequestSchema.annotations({ description: "Normalized request that produced this result." }),
    qna: QnaSchema,
  }).annotations({ description: "Q&A document retrieval payload." }),
  metadata: ResultMetadataSchema,
  references: Schema.Struct({
    docNumber: DocNumberSchema,
    qnaUrl: SourceUrlSchema,
  }).annotations({ description: "Operation-level source reference for the Q&A document." }),
  warnings: Schema.Array(
    Schema.Struct({
      code: Schema.Literal("source_metadata_incomplete"),
      message: Schema.String.annotations({ description: "Human-readable warning detail." }),
    }),
  ),
});
export type GetQnaResult = typeof GetQnaResultSchema.Type;
