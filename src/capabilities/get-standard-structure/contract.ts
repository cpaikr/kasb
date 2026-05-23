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
    description: "조회용 섹션 트리를 반환할 KASB 기준서 번호입니다.",
    examples: ["1116"],
  }),
  keyword: Schema.optional(Schema.String.annotations({
    description: "원천 측 구조 검색 metadata에 사용할 선택 검색어입니다. searchWord로 매핑됩니다.",
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
    description: "KASB 기준서 index에서 정규화한 섹션 제목입니다.",
    examples: ["목적"],
  }),
  ref: Schema.String.annotations({
    description: "get-section --ref에 사용할 수 있는 섹션 문단 범위 또는 참조 label입니다.",
    examples: ["1~2", "153~158"],
  }),
  level: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
    description: "기준서 구조 tree 안에서 이 섹션 node의 깊이입니다.",
    examples: [2],
  }),
  documentType: Schema.optional(Schema.String.annotations({
    description: "제공되는 경우 본문 외 또는 특수 node에 대한 KASB 원천 document type입니다.",
    examples: ["overview"],
  })),
  parentDocumentIds: Schema.Array(IndexDocumentIdSchema).annotations({
    description: "KASB index tree의 상위 조회용 섹션 ID 목록입니다.",
  }),
  sort: Schema.optional(Schema.Number.annotations({
    description: "제공되는 경우 안정적인 표시 순서에 사용할 원천 ordering 값입니다.",
    examples: [1],
  })),
}).annotations({ description: "get-standard-structure가 반환한 조회용 섹션 node 하나입니다." });
export type StandardSectionNode = typeof StandardSectionNodeSchema.Type;

export const GetStandardStructureResultSchema = Schema.Struct({
  result: Schema.Struct({
    request: GetStandardStructureRequestSchema.annotations({ description: "이 결과를 만든 정규화된 request입니다." }),
    sections: Schema.Array(StandardSectionNodeSchema).annotations({
      description: "indexDocumentId 값을 get-section에 전달할 수 있는 섹션 node입니다.",
    }),
    returnedCount: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
      description: "이 응답에 포함된 섹션 node 개수입니다.",
      examples: [120],
    }),
  }).annotations({ description: "기준서 구조 payload입니다." }),
  metadata: ResultMetadataSchema,
  references: Schema.Struct({
    stdNum: StdNumSchema,
    structureUrl: SourceUrlSchema,
  }).annotations({ description: "기준서 구조에 대한 operation-level 원천 참조입니다." }),
  warnings: Schema.Array(
    Schema.Struct({
      code: Schema.Literal("search_filtered_structure", "source_metadata_incomplete"),
      message: Schema.String.annotations({ description: "사람이 읽을 수 있는 warning 상세입니다." }),
    }),
  ),
});
export type GetStandardStructureResult = typeof GetStandardStructureResultSchema.Type;
