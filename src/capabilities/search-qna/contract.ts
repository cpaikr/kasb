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

const fields = new Set(["keyword", "page", "rows", "types", "sortDate", "from", "to"]);
const observedDefaultTypes = defaultObservedQnaTypeIds.join(",");
const qnaTypesCsvPattern = /^\s*(?:\d+\s*(?:,\s*\d+\s*)*)?$/u;
const qnaDatePattern = /^\d{4}-\d{2}-\d{2}$/u;
const qnaSortDateValues = ["asc", "desc"] as const;

export const SearchQnaRequestSchema = Schema.Struct({
  keyword: Schema.String.pipe(Schema.minLength(1)).annotations({
    description: "Keyword used to find KASB Q&A documents. Maps to the source searchWord parameter.",
    examples: ["리스", "종업원급여"],
  }),
  page: Schema.optionalWith(
    Schema.Int.pipe(Schema.greaterThanOrEqualTo(1), Schema.lessThanOrEqualTo(1000)),
    { default: () => 1 },
  ).annotations({
    description: "1-based result page number, from 1 to 1000. Without recency controls this maps to the source page; with sortDate/from/to it pages over the client-side filtered result window.",
    examples: [1, 2],
  }),
  rows: Schema.optionalWith(
    Schema.Int.pipe(Schema.greaterThanOrEqualTo(1), Schema.lessThanOrEqualTo(50)),
    { default: () => 10 },
  ).annotations({
    description: "Number of Q&A rows per page, from 1 to 50. CLI --limit is an alias for this field.",
    examples: [5, 10],
  }),
  types: Schema.optional(Schema.String.pipe(Schema.pattern(qnaTypesCsvPattern)).annotations({
    description: "Source-facing numeric Q&A type id CSV. Defaults to observed public types 11,12,13,14,15,24,25 when omitted. Override only when you know which KASB source type ids to include.",
    examples: [observedDefaultTypes, "24,25"],
  })),
  sortDate: Schema.optional(Schema.Literal(...qnaSortDateValues).annotations({
    description: "Client-side sort by source publishDate within the fetched Q&A search window. Use desc for newest first and asc for oldest first.",
    examples: ["desc"],
  })),
  from: Schema.optional(Schema.String.pipe(Schema.pattern(qnaDatePattern)).annotations({
    description: "Inclusive lower publishDate bound in YYYY-MM-DD form. Applied client-side because the observed source endpoint does not provide date filter parameters.",
    examples: ["2024-01-01"],
  })),
  to: Schema.optional(Schema.String.pipe(Schema.pattern(qnaDatePattern)).annotations({
    description: "Inclusive upper publishDate bound in YYYY-MM-DD form. Applied client-side because the observed source endpoint does not provide date filter parameters.",
    examples: ["2024-12-31"],
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
  const sortDate = normalizeQnaSortDate(readOptionalString(input, "sortDate"));
  const from = normalizeQnaDate(readOptionalString(input, "from"), "from");
  const to = normalizeQnaDate(readOptionalString(input, "to"), "to");
  if (from !== undefined && to !== undefined && from > to) {
    throw new InvalidCapabilityRequest({
      parameter: "to",
      message: "Parameter \"to\" must be the same as or later than \"from\".",
    });
  }
  return {
    keyword: readRequiredString(input, "keyword"),
    page: readOptionalInteger(input, "page", { defaultValue: 1, min: 1, max: 1000 }),
    rows: readOptionalInteger(input, "rows", { defaultValue: 10, min: 1, max: 50 }),
    ...(types === undefined ? {} : { types }),
    ...(sortDate === undefined ? {} : { sortDate }),
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
  };
};

const normalizeQnaTypes = (types: string | undefined): string | undefined => {
  if (types === undefined) return undefined;
  const typeIds = types.split(",").map((typeId) => typeId.trim());
  if (typeIds.some((typeId) => !/^\d+$/u.test(typeId))) {
    throw new InvalidCapabilityRequest({
      parameter: "types",
      message: `Parameter "types" must be a CSV of numeric Q&A type ids. The observed default is ${observedDefaultTypes}.`,
    });
  }
  return typeIds.join(",");
};

const normalizeQnaSortDate = (sortDate: string | undefined): "asc" | "desc" | undefined => {
  if (sortDate === undefined) return undefined;
  if (sortDate === "asc" || sortDate === "desc") return sortDate;
  throw new InvalidCapabilityRequest({
    parameter: "sortDate",
    message: "Parameter \"sortDate\" must be asc or desc.",
  });
};

const normalizeQnaDate = (date: string | undefined, parameter: "from" | "to"): string | undefined => {
  if (date === undefined) return undefined;
  if (!qnaDatePattern.test(date) || !isRealIsoDate(date)) {
    throw new InvalidCapabilityRequest({
      parameter,
      message: `Parameter \"${parameter}\" must be a real date in YYYY-MM-DD form.`,
    });
  }
  return date;
};

const isRealIsoDate = (date: string): boolean => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};

export const QnaSearchItemSchema = Schema.Struct({
  docNumber: DocNumberSchema,
  type: Schema.Number.annotations({
    description: "Source-facing Q&A type id.",
    examples: [24],
  }),
  typeLabel: Schema.String.annotations({
    description: "Observed human-readable Q&A type label derived from source type metadata.",
    examples: ["K-IFRS · 신속처리질의"],
  }),
  title: Schema.String.annotations({
    description: "Q&A title normalized from source highlight text.",
    examples: ["리스 개시일과 계약일"],
  }),
  snippet: Schema.String.annotations({
    description: "Short plain-text content excerpt for scanning search results.",
  }),
  tags: Schema.Array(Schema.String.annotations({
    description: "Source tag attached to the Q&A document.",
    examples: ["리스"],
  })).annotations({ description: "Q&A source tag." }),
  deprecated: Schema.Boolean.annotations({
    description: "Whether the source marks this Q&A document as deprecated or superseded.",
    examples: [false],
  }),
  contentLink: Schema.optional(Schema.String.annotations({
    description: "Content link provided by the source, when available. It can point outside the KASB JSON API.",
    examples: ["https://facility-qnas.s3.ap-northeast-2.amazonaws.com/kasb/quick/kifrs/html/35629.html"],
  })),
  publishDate: Schema.optional(Schema.String.annotations({
    description: "Source publication date string, when available.",
    examples: ["2020-01-01"],
  })),
  prefix: Schema.optional(Schema.String.annotations({
    description: "Source prefix/category text, when available.",
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
      description: "Matched Q&A documents. Pass docNumber to get-qna to retrieve the full document.",
    }),
    returnedCount: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
      description: "Number of Q&A items included in this response.",
      examples: [10],
    }),
    totalCount: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
      description: "Total number of Q&A records matching the requested controls. Without recency controls this comes from source count metadata; with sortDate/from/to it is derived from the scanned/filtered result window.",
      examples: [149],
    }),
    totalPages: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
      description: "Total result page count for the requested rows value, derived from totalCount.",
      examples: [30],
    }),
    hasNextPage: Schema.Boolean.annotations({
      description: "Whether another page exists after the requested page.",
      examples: [true],
    }),
    paginationStatus: Schema.Literal("known", "estimated").annotations({
      description: "Whether pagination metadata is derived from complete source count data or from a conservative fallback.",
      examples: ["known"],
    }),
    countByType: Schema.Record({
      key: Schema.String.annotations({ description: "Source-facing Q&A type id represented as a string key.", examples: ["24"] }),
      value: Schema.Number.annotations({ description: "Number of Q&A records matched for this type.", examples: [3] }),
    }).annotations({ description: "Counts by Q&A type id. Without recency controls these come from source metadata; with sortDate/from/to they are derived from the scanned/filtered result window." }),
    typeLabels: Schema.Record({
      key: Schema.String.annotations({ description: "Source-facing Q&A type id represented as a string key.", examples: ["15"] }),
      value: Schema.String.annotations({ description: "Observed human-readable label for the Q&A type id.", examples: ["K-IFRS · 신속처리질의"] }),
    }).annotations({ description: "Observed labels for public Q&A type ids included in counts or returned items." }),
    suggestedKeywords: Schema.Array(Schema.String).annotations({
      description: "Broader or spacing-normalized Q&A search terms to try when the exact search is empty or too narrow.",
      examples: [["장기 종업원 급여", "종업원급여"]],
    }),
  }).annotations({ description: "Q&A search payload." }),
  metadata: ResultMetadataSchema,
  references: Schema.Struct({ searchUrl: SourceUrlSchema }).annotations({ description: "Operation-level source reference for Q&A search." }),
  warnings: Schema.Array(
    Schema.Struct({
      code: Schema.Literal("source_metadata_incomplete"),
      message: Schema.String.annotations({ description: "Human-readable warning detail." }),
    }),
  ),
});
export type SearchQnaResult = typeof SearchQnaResultSchema.Type;
