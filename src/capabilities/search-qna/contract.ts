import { Schema } from "effect";

import {
  assertNoUnknownKeys,
  assertObjectInput,
  readOptionalInteger,
  readOptionalString,
  readRequiredString,
} from "../request-validation.ts";
import { DocNumberSchema, ResultMetadataSchema, SourceUrlSchema } from "../types.ts";

const fields = new Set(["keyword", "page", "rows", "types"]);

export const SearchQnaRequestSchema = Schema.Struct({
  keyword: Schema.String.pipe(Schema.minLength(1)).annotations({
    description: "Keyword used to find KASB Q&A documents; mapped to the source searchWord parameter.",
    examples: ["리스", "종업원급여"],
  }),
  page: Schema.optionalWith(
    Schema.Int.pipe(Schema.greaterThanOrEqualTo(1), Schema.lessThanOrEqualTo(1000)),
    { default: () => 1 },
  ).annotations({
    description: "One-based source result page number, from 1 to 1000.",
    examples: [1, 2],
  }),
  rows: Schema.optionalWith(
    Schema.Int.pipe(Schema.greaterThanOrEqualTo(1), Schema.lessThanOrEqualTo(50)),
    { default: () => 10 },
  ).annotations({
    description: "Number of Q&A rows to return per page, from 1 to 50. CLI --limit is an alias for this field.",
    examples: [5, 10],
  }),
  types: Schema.optional(Schema.String.annotations({
    description: "Source-facing Q&A type id CSV. Defaults to observed public types 11,12,13,14,15,24,25 when omitted.",
    examples: ["11,12,13,14,15,24,25"],
  })),
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
  docNumber: DocNumberSchema,
  type: Schema.Number.annotations({
    description: "Source-facing Q&A type id.",
    examples: [24],
  }),
  title: Schema.String.annotations({
    description: "Q&A title with source highlights normalized to text.",
    examples: ["리스 개시일과 계약일"],
  }),
  snippet: Schema.String.annotations({
    description: "Short plain-text content excerpt for scanning search results.",
  }),
  tags: Schema.Array(Schema.String.annotations({
    description: "Source tag attached to the Q&A document.",
    examples: ["리스"],
  })).annotations({ description: "Q&A source tags." }),
  deprecated: Schema.Boolean.annotations({
    description: "Whether the source marks this Q&A document as deprecated or superseded.",
    examples: [false],
  }),
  contentLink: Schema.optional(Schema.String.annotations({
    description: "Source-provided content link when available; may point outside the KASB JSON API.",
    examples: ["https://facility-qnas.s3.ap-northeast-2.amazonaws.com/kasb/quick/kifrs/html/35629.html"],
  })),
  publishDate: Schema.optional(Schema.String.annotations({
    description: "Source publication date string when available.",
    examples: ["2020-01-01"],
  })),
  prefix: Schema.optional(Schema.String.annotations({
    description: "Source prefix/category text when available.",
    examples: ["신속처리질의"],
  })),
  references: Schema.Struct({ qnaUrl: SourceUrlSchema }).annotations({
    description: "Source API reference for this Q&A search item.",
  }),
}).annotations({ description: "One Q&A search result." });
export type QnaSearchItem = typeof QnaSearchItemSchema.Type;

export const SearchQnaResultSchema = Schema.Struct({
  result: Schema.Struct({
    request: SearchQnaRequestSchema.annotations({ description: "Normalized request that produced this result." }),
    items: Schema.Array(QnaSearchItemSchema).annotations({
      description: "Matching Q&A documents; pass a docNumber to get-qna for the full document.",
    }),
    returnedCount: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
      description: "Number of Q&A items included in this response.",
      examples: [10],
    }),
    countByType: Schema.Record({
      key: Schema.String.annotations({ description: "Source-facing Q&A type id as a string key.", examples: ["24"] }),
      value: Schema.Number.annotations({ description: "Number of matched Q&A records for this type.", examples: [3] }),
    }).annotations({ description: "Source-provided counts grouped by Q&A type id when available." }),
  }).annotations({ description: "Q&A search payload." }),
  metadata: ResultMetadataSchema,
  references: Schema.Struct({ searchUrl: SourceUrlSchema }).annotations({ description: "Operation-level source reference for the Q&A search." }),
  warnings: Schema.Array(
    Schema.Struct({
      code: Schema.Literal("source_html_preserved", "source_metadata_incomplete"),
      message: Schema.String.annotations({ description: "Human-readable warning detail." }),
    }),
  ),
});
export type SearchQnaResult = typeof SearchQnaResultSchema.Type;
