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
    description: "KASB 기준서를 찾을 검색어입니다. 원천 searchWord 매개변수로 매핑됩니다.",
    examples: ["리스", "수익인식"],
  }),
  limit: Schema.optionalWith(
    Schema.Int.pipe(Schema.greaterThanOrEqualTo(1), Schema.lessThanOrEqualTo(100)),
    { default: () => 20 },
  ).annotations({
    description: "반환할 기준서 최대 개수입니다. 1~100 사이입니다.",
    examples: [10, 20],
  }),
  sort: Schema.optionalWith(Schema.Literal(...searchStandardsSorts), { default: () => "relevance" as const }).annotations({
    description: "반환 기준서 정렬 방식입니다. relevance는 제목 매치와 높은 match count를 우선하고, match-count는 원천 hit count, std-num은 기준서 번호, title은 보강된 제목으로 정렬합니다.",
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

const SearchStandardNextActionsSchema = Schema.Struct({
  getStandardStructure: Schema.Struct({
    operation: Schema.Literal("get-standard-structure").annotations({
      description: "이 기준서에 대해 다음에 호출할 capability operation입니다.",
    }),
    input: Schema.Struct({
      stdNum: StdNumSchema,
    }).annotations({
      description: "후속 구조 조회 operation에 전달할 typed input입니다.",
      examples: [{ stdNum: "1116" }],
    }),
  }).annotations({ description: "섹션을 조회하기 전에 기준서 구조를 확인하기 위한 transport-neutral follow-up action입니다." }),
}).annotations({ description: "이 검색 결과에 대해 제안하는 transport-neutral follow-up action입니다." });

export const SearchStandardItemSchema = Schema.Struct({
  stdNum: StdNumSchema,
  standardTitle: Schema.optional(Schema.String.annotations({
    description: "원천 결과에 제목 metadata가 있을 때 제공하는 best-effort KASB 기준서 제목입니다.",
    examples: ["리스"],
  })),
  standardKind: Schema.optional(Schema.String.annotations({
    description: "원천에서 확인할 수 있을 때 제공하는 best-effort 기준서 계열 또는 framework label입니다.",
    examples: ["K-IFRS"],
  })),
  matchCount: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
    description: "원천이 이 기준서에 대해 보고한 문단 또는 content hit 수입니다.",
    examples: [1043],
  }),
  references: Schema.Struct({ apiUrl: SourceUrlSchema }).annotations({
    description: "이 기준서 검색 항목의 원천 API 참조입니다.",
  }),
  nextActions: SearchStandardNextActionsSchema,
}).annotations({ description: "구조 조회 follow-up action을 포함한 기준서 단위 검색 결과입니다." });
export type SearchStandardItem = typeof SearchStandardItemSchema.Type;

export const SearchStandardsResultSchema = Schema.Struct({
  result: Schema.Struct({
    request: SearchStandardsRequestSchema.annotations({ description: "이 결과를 만든 정규화된 request입니다." }),
    totalMatchCount: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
      description: "반환된 기준서와 반환되지 않은 기준서를 모두 포함한 원천 hit count 합계입니다.",
      examples: [1043],
    }),
    totalStandardCount: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
      description: "원천 검색에서 매치된 기준서 총 개수입니다.",
      examples: [27],
    }),
    returnedCount: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
      description: "limit 적용 후 이 응답에 포함된 기준서 개수입니다.",
      examples: [20],
    }),
    standards: Schema.Array(SearchStandardItemSchema).annotations({
      description: "get-standard-structure 또는 get-paragraph를 호출하기 전에 검토할 매칭 기준서입니다.",
    }),
    suggestedKeywords: Schema.Array(Schema.String.annotations({
      description: "원천이 제안한 관련 검색어입니다.",
      examples: ["금융리스"],
    })).annotations({ description: "원천에서 제공될 때 반환하는 더 넓거나 관련된 검색어입니다." }),
  }).annotations({ description: "기준서 검색 payload입니다." }),
  metadata: ResultMetadataSchema,
  references: Schema.Struct({ searchUrl: SourceUrlSchema }).annotations({ description: "operation-level 원천 참조입니다." }),
  warnings: Schema.Array(
    Schema.Struct({
      code: Schema.Literal("truncated_results", "source_metadata_incomplete"),
      message: Schema.String.annotations({ description: "사람이 읽을 수 있는 warning 상세입니다." }),
    }),
  ),
});
export type SearchStandardsResult = typeof SearchStandardsResultSchema.Type;
