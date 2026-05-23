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
    description: "KASB Q&A 문서를 찾을 검색어입니다. 원천 searchWord 매개변수로 매핑됩니다.",
    examples: ["리스", "종업원급여"],
  }),
  page: Schema.optionalWith(
    Schema.Int.pipe(Schema.greaterThanOrEqualTo(1), Schema.lessThanOrEqualTo(1000)),
    { default: () => 1 },
  ).annotations({
    description: "1부터 시작하는 결과 page 번호입니다. 1~1000 사이입니다. recency control이 없으면 원천 page로 매핑되고, sortDate/from/to가 있으면 client-side filtering 결과 창에서 paging합니다.",
    examples: [1, 2],
  }),
  rows: Schema.optionalWith(
    Schema.Int.pipe(Schema.greaterThanOrEqualTo(1), Schema.lessThanOrEqualTo(50)),
    { default: () => 10 },
  ).annotations({
    description: "page당 반환할 Q&A row 수입니다. 1~50 사이입니다. CLI --limit는 이 field의 alias입니다.",
    examples: [5, 10],
  }),
  types: Schema.optional(Schema.String.pipe(Schema.pattern(qnaTypesCsvPattern)).annotations({
    description: "원천-facing 숫자 Q&A type id CSV입니다. 생략하면 관찰된 공개 type 11,12,13,14,15,24,25가 기본값입니다. 포함할 KASB 원천 type id를 알고 있을 때만 override하세요.",
    examples: [observedDefaultTypes, "24,25"],
  })),
  sortDate: Schema.optional(Schema.Literal(...qnaSortDateValues).annotations({
    description: "가져온 Q&A 검색 창에서 원천 publishDate 기준 client-side 정렬을 합니다. 최신순은 desc, 오래된순은 asc를 사용하세요.",
    examples: ["desc"],
  })),
  from: Schema.optional(Schema.String.pipe(Schema.pattern(qnaDatePattern)).annotations({
    description: "YYYY-MM-DD 형식의 publishDate 하한(포함)입니다. 관찰된 원천 endpoint가 date filter parameter를 제공하지 않아 client-side로 적용합니다.",
    examples: ["2024-01-01"],
  })),
  to: Schema.optional(Schema.String.pipe(Schema.pattern(qnaDatePattern)).annotations({
    description: "YYYY-MM-DD 형식의 publishDate 상한(포함)입니다. 관찰된 원천 endpoint가 date filter parameter를 제공하지 않아 client-side로 적용합니다.",
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
      message: "매개변수 \"to\"은(는) \"from\"과 같거나 그 이후 날짜여야 합니다.",
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
      message: `매개변수 "types"은(는) 숫자 Q&A 유형 ID의 CSV여야 합니다. 기본 관찰값은 ${observedDefaultTypes}입니다.`,
    });
  }
  return typeIds.join(",");
};

const normalizeQnaSortDate = (sortDate: string | undefined): "asc" | "desc" | undefined => {
  if (sortDate === undefined) return undefined;
  if (sortDate === "asc" || sortDate === "desc") return sortDate;
  throw new InvalidCapabilityRequest({
    parameter: "sortDate",
    message: "매개변수 \"sortDate\"은(는) asc 또는 desc여야 합니다.",
  });
};

const normalizeQnaDate = (date: string | undefined, parameter: "from" | "to"): string | undefined => {
  if (date === undefined) return undefined;
  if (!qnaDatePattern.test(date) || !isRealIsoDate(date)) {
    throw new InvalidCapabilityRequest({
      parameter,
      message: `매개변수 \"${parameter}\"은(는) YYYY-MM-DD 형식의 실제 날짜여야 합니다.`,
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
    description: "원천-facing Q&A type id입니다.",
    examples: [24],
  }),
  typeLabel: Schema.String.annotations({
    description: "원천 type metadata에서 파생한 관찰된 human-readable Q&A type label입니다.",
    examples: ["K-IFRS · 신속처리질의"],
  }),
  title: Schema.String.annotations({
    description: "원천 highlight를 text로 정규화한 Q&A 제목입니다.",
    examples: ["리스 개시일과 계약일"],
  }),
  snippet: Schema.String.annotations({
    description: "검색 결과 검토를 위한 짧은 plain-text content excerpt입니다.",
  }),
  tags: Schema.Array(Schema.String.annotations({
    description: "Q&A 문서에 붙은 원천 tag입니다.",
    examples: ["리스"],
  })).annotations({ description: "Q&A 원천 tag입니다." }),
  deprecated: Schema.Boolean.annotations({
    description: "원천이 이 Q&A 문서를 deprecated 또는 superseded로 표시하는지 여부입니다.",
    examples: [false],
  }),
  contentLink: Schema.optional(Schema.String.annotations({
    description: "확인 가능한 경우 원천이 제공한 content link입니다. KASB JSON API 밖을 가리킬 수 있습니다.",
    examples: ["https://facility-qnas.s3.ap-northeast-2.amazonaws.com/kasb/quick/kifrs/html/35629.html"],
  })),
  publishDate: Schema.optional(Schema.String.annotations({
    description: "확인 가능한 경우 원천 publication date string입니다.",
    examples: ["2020-01-01"],
  })),
  prefix: Schema.optional(Schema.String.annotations({
    description: "확인 가능한 경우 원천 prefix/category text입니다.",
    examples: ["신속처리질의"],
  })),
  references: Schema.Struct({ qnaUrl: SourceUrlSchema }).annotations({
    description: "이 Q&A 검색 항목의 원천 API 참조입니다.",
  }),
}).annotations({ description: "Q&A 검색 결과 하나입니다." });
export type QnaSearchItem = typeof QnaSearchItemSchema.Type;

export const SearchQnaResultSchema = Schema.Struct({
  result: Schema.Struct({
    request: SearchQnaRequestSchema.annotations({ description: "이 결과를 만든 정규화된 request입니다." }),
    items: Schema.Array(QnaSearchItemSchema).annotations({
      description: "매칭된 Q&A 문서입니다. 전체 문서는 docNumber를 get-qna에 전달해 조회하세요.",
    }),
    returnedCount: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
      description: "이 응답에 포함된 Q&A 항목 수입니다.",
      examples: [10],
    }),
    totalCount: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
      description: "요청한 control에 매칭된 Q&A record 총수입니다. recency control이 없으면 원천 count metadata에서, sortDate/from/to가 있으면 scan/filter 결과 창에서 파생합니다.",
      examples: [149],
    }),
    totalPages: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
      description: "요청한 rows 값에 대한 전체 결과 page 수입니다. totalCount에서 파생합니다.",
      examples: [30],
    }),
    hasNextPage: Schema.Boolean.annotations({
      description: "요청한 page 뒤에 다음 page가 있는지 여부입니다.",
      examples: [true],
    }),
    paginationStatus: Schema.Literal("known", "estimated").annotations({
      description: "pagination metadata가 완전한 원천 count data에서 파생되었는지, 보수적 fallback에서 파생되었는지 나타냅니다.",
      examples: ["known"],
    }),
    countByType: Schema.Record({
      key: Schema.String.annotations({ description: "string key로 표현한 원천-facing Q&A type id입니다.", examples: ["24"] }),
      value: Schema.Number.annotations({ description: "이 type에 매칭된 Q&A record 수입니다.", examples: [3] }),
    }).annotations({ description: "Q&A type id별 count입니다. recency control이 없으면 원천 metadata에서, sortDate/from/to가 있으면 scan/filter 결과 창에서 파생합니다." }),
    typeLabels: Schema.Record({
      key: Schema.String.annotations({ description: "string key로 표현한 원천-facing Q&A type id입니다.", examples: ["15"] }),
      value: Schema.String.annotations({ description: "Q&A type id에 대한 관찰된 human-readable label입니다.", examples: ["K-IFRS · 신속처리질의"] }),
    }).annotations({ description: "count 또는 반환 항목에 포함된 공개 Q&A type id의 관찰된 label입니다." }),
    suggestedKeywords: Schema.Array(Schema.String).annotations({
      description: "정확 검색이 비어 있거나 너무 좁을 때 시도할 더 넓거나 띄어쓰기를 정규화한 Q&A 검색어입니다.",
      examples: [["장기 종업원 급여", "종업원급여"]],
    }),
  }).annotations({ description: "Q&A 검색 payload입니다." }),
  metadata: ResultMetadataSchema,
  references: Schema.Struct({ searchUrl: SourceUrlSchema }).annotations({ description: "Q&A 검색에 대한 operation-level 원천 참조입니다." }),
  warnings: Schema.Array(
    Schema.Struct({
      code: Schema.Literal("source_metadata_incomplete"),
      message: Schema.String.annotations({ description: "사람이 읽을 수 있는 warning 상세입니다." }),
    }),
  ),
});
export type SearchQnaResult = typeof SearchQnaResultSchema.Type;
