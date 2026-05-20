import { Schema } from "effect";

import {
  assertNoUnknownKeys,
  assertObjectInput,
  readOptionalInteger,
  readOptionalString,
  readRequiredString,
} from "../request-validation.ts";
import { defaultObservedQnaTypeIds } from "../qna-types.ts";
import { DocNumberSchema, InvalidCapabilityRequest, ResultMetadataSchema, SourceUrlSchema } from "../types.ts";

const fields = new Set(["keyword", "page", "rows", "types"]);
const observedDefaultTypes = defaultObservedQnaTypeIds.join(",");
const qnaTypesCsvPattern = /^\s*(?:\d+\s*(?:,\s*\d+\s*)*)?$/u;

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
  types: Schema.optional(Schema.String.pipe(Schema.pattern(qnaTypesCsvPattern)).annotations({
    description: "Source-facing numeric Q&A type id CSV. Defaults to observed public types 11,12,13,14,15,24,25 when omitted; override only when you know the KASB source type ids to include.",
    examples: [observedDefaultTypes, "24,25"],
  })),
});
export type SearchQnaRawInput = typeof SearchQnaRequestSchema.Encoded;
export type SearchQnaRequest = typeof SearchQnaRequestSchema.Type;

export const resolveSearchQnaRequest = (
  input: Partial<SearchQnaRawInput> & Record<string, unknown>,
): SearchQnaRequest => {
  assertObjectInput(input);
  assertNoUnknownKeys(input, fields);
  const types = normalizeQnaTypes(readOptionalString(input, "types"));
  return {
    keyword: readRequiredString(input, "keyword"),
    page: readOptionalInteger(input, "page", { defaultValue: 1, min: 1, max: 1000 }),
    rows: readOptionalInteger(input, "rows", { defaultValue: 10, min: 1, max: 50 }),
    ...(types === undefined ? {} : { types }),
  };
};

const normalizeQnaTypes = (types: string | undefined): string | undefined => {
  if (types === undefined) return undefined;
  const typeIds = types.split(",").map((typeId) => typeId.trim());
  if (typeIds.some((typeId) => !/^\d+$/u.test(typeId))) {
    throw new InvalidCapabilityRequest({
      parameter: "types",
      message: `매개변수 "types"은(는) 숫자 Q&A 유형 ID의 CSV여야 합니다. 기본 관찰값은 ${observedDefaultTypes}입니다.`,
    });
  }
  return typeIds.join(",");
};

export const QnaSearchItemSchema = Schema.Struct({
  docNumber: DocNumberSchema,
  type: Schema.Number.annotations({
    description: "Source-facing Q&A type id.",
    examples: [24],
  }),
  typeLabel: Schema.String.annotations({
    description: "Observed human-readable Q&A type label derived from the source type metadata.",
    examples: ["K-IFRS · 신속처리질의"],
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
    totalCount: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
      description: "Total matched Q&A records derived from source count metadata for the requested keyword and type filter.",
      examples: [149],
    }),
    totalPages: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
      description: "Total source result pages for the requested rows value, derived from totalCount.",
      examples: [30],
    }),
    hasNextPage: Schema.Boolean.annotations({
      description: "Whether another page is available after the requested page.",
      examples: [true],
    }),
    paginationStatus: Schema.Literal("known", "estimated").annotations({
      description: "Whether pagination metadata is derived from complete source count data or from a conservative fallback.",
      examples: ["known"],
    }),
    countByType: Schema.Record({
      key: Schema.String.annotations({ description: "Source-facing Q&A type id as a string key.", examples: ["24"] }),
      value: Schema.Number.annotations({ description: "Number of matched Q&A records for this type.", examples: [3] }),
    }).annotations({ description: "Source-provided counts grouped by Q&A type id when available." }),
    typeLabels: Schema.Record({
      key: Schema.String.annotations({ description: "Source-facing Q&A type id as a string key.", examples: ["15"] }),
      value: Schema.String.annotations({ description: "Observed human-readable label for the Q&A type id.", examples: ["K-IFRS · 신속처리질의"] }),
    }).annotations({ description: "Observed labels for public Q&A type ids included in counts or returned items." }),
  }).annotations({ description: "Q&A search payload." }),
  metadata: ResultMetadataSchema,
  references: Schema.Struct({ searchUrl: SourceUrlSchema }).annotations({ description: "Operation-level source reference for the Q&A search." }),
  warnings: Schema.Array(
    Schema.Struct({
      code: Schema.Literal("source_metadata_incomplete"),
      message: Schema.String.annotations({ description: "Human-readable warning detail." }),
    }),
  ),
});
export type SearchQnaResult = typeof SearchQnaResultSchema.Type;
