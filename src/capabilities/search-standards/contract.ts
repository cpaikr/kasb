import { Schema } from "effect";

import {
  assertNoUnknownKeys,
  assertObjectInput,
  readOptionalInteger,
  readRequiredString,
} from "../request-validation.ts";
import { InvalidCapabilityRequest, ResultMetadataSchema, SourceUrlSchema, StdNumSchema } from "../types.ts";

export const searchStandardsSorts = ["relevance", "match-count", "std-num", "title"] as const;
export type SearchStandardsSort = (typeof searchStandardsSorts)[number];

const fields = new Set(["keyword", "limit", "sort"]);

export const SearchStandardsRequestSchema = Schema.Struct({
  keyword: Schema.String.pipe(Schema.minLength(1)).annotations({
    description: "Keyword used to find KASB standards; mapped to the source searchWord parameter.",
    examples: ["리스", "수익인식"],
  }),
  limit: Schema.optionalWith(
    Schema.Int.pipe(Schema.greaterThanOrEqualTo(1), Schema.lessThanOrEqualTo(100)),
    { default: () => 20 },
  ).annotations({
    description: "Maximum number of matching standards to return, from 1 to 100.",
    examples: [10, 20],
  }),
  sort: Schema.optionalWith(Schema.Literal(...searchStandardsSorts), { default: () => "relevance" as const }).annotations({
    description: "Ordering for returned standards. relevance favors title matches and high match counts; match-count sorts by source hit count; std-num sorts by standard number; title sorts by enriched title.",
    examples: ["relevance", "match-count"],
  }),
});
export type SearchStandardsRawInput = typeof SearchStandardsRequestSchema.Encoded;
export type SearchStandardsRequest = typeof SearchStandardsRequestSchema.Type;

export const resolveSearchStandardsRequest = (
  input: Partial<SearchStandardsRawInput> & Record<string, unknown>,
): SearchStandardsRequest => {
  assertObjectInput(input);
  assertNoUnknownKeys(input, fields);
  const sort = readSearchStandardsSort(input.sort);
  return {
    keyword: readRequiredString(input, "keyword"),
    limit: readOptionalInteger(input, "limit", { defaultValue: 20, min: 1, max: 100 }),
    sort,
  };
};

const readSearchStandardsSort = (value: unknown): SearchStandardsSort => {
  if (value === undefined) return "relevance";
  if (typeof value !== "string") {
    throw new InvalidCapabilityRequest({
      parameter: "sort",
      message: '매개변수 "sort"은(는) 문자열이어야 합니다.',
    });
  }
  const trimmed = value.trim();
  if (searchStandardsSorts.includes(trimmed as SearchStandardsSort)) return trimmed as SearchStandardsSort;
  throw new InvalidCapabilityRequest({
    parameter: "sort",
    message: `매개변수 "sort"은(는) ${searchStandardsSorts.join(", ")} 중 하나여야 합니다.`,
  });
};

export const SearchStandardItemSchema = Schema.Struct({
  stdNum: StdNumSchema,
  standardTitle: Schema.optional(Schema.String.annotations({
    description: "Best-effort KASB standard title when the source result includes title metadata.",
    examples: ["리스"],
  })),
  standardKind: Schema.optional(Schema.String.annotations({
    description: "Best-effort standard family or framework label when available from the source.",
    examples: ["K-IFRS"],
  })),
  matchCount: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
    description: "Number of source paragraph or content hits reported for this standard.",
    examples: [1043],
  }),
  references: Schema.Struct({ apiUrl: SourceUrlSchema }).annotations({
    description: "Source API reference for this standard search item.",
  }),
}).annotations({ description: "One standard-level search result." });
export type SearchStandardItem = typeof SearchStandardItemSchema.Type;

export const SearchStandardsResultSchema = Schema.Struct({
  result: Schema.Struct({
    request: SearchStandardsRequestSchema.annotations({ description: "Normalized request that produced this result." }),
    totalMatchCount: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
      description: "Total source hit count across returned and unreturned standards.",
      examples: [1043],
    }),
    totalStandardCount: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
      description: "Total number of standards matched by the source search.",
      examples: [27],
    }),
    returnedCount: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
      description: "Number of standards included in this response after applying limit.",
      examples: [20],
    }),
    standards: Schema.Array(SearchStandardItemSchema).annotations({
      description: "Matching standards to inspect before calling get-standard-structure or get-paragraph.",
    }),
    suggestedKeywords: Schema.Array(Schema.String.annotations({
      description: "Related source keyword suggestion.",
      examples: ["금융리스"],
    })).annotations({ description: "Broader or related search terms returned by the source when available." }),
  }).annotations({ description: "Standard search payload." }),
  metadata: ResultMetadataSchema,
  references: Schema.Struct({ searchUrl: SourceUrlSchema }).annotations({ description: "Operation-level source reference." }),
  warnings: Schema.Array(
    Schema.Struct({
      code: Schema.Literal("truncated_results", "source_metadata_incomplete"),
      message: Schema.String.annotations({ description: "Human-readable warning detail." }),
    }),
  ),
});
export type SearchStandardsResult = typeof SearchStandardsResultSchema.Type;
