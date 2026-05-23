import { Schema } from "effect";

import {
  assertNoUnknownKeys,
  assertObjectInput,
  readOptionalString,
  readRequiredString,
} from "../request-validation.ts";
import {
  IndexDocumentIdSchema,
  InvalidCapabilityRequest,
  ParaNumSchema,
  ResultMetadataSchema,
  SourceUrlSchema,
  StdNumSchema,
} from "../types.ts";

const fields = new Set(["stdNum", "indexDocumentId", "ref", "keyword"]);

export const GetSectionRequestSchema = Schema.Struct({
  stdNum: StdNumSchema.annotations({
    description: "조회할 섹션이 포함된 KASB 기준서 번호입니다.",
    examples: ["1116"],
  }),
  indexDocumentId: Schema.optional(IndexDocumentIdSchema),
  ref: Schema.optional(Schema.String.pipe(Schema.minLength(1)).annotations({
    description: "indexDocumentId를 모를 때 대체 조회에 사용하는 get-standard-structure의 섹션 ref/range입니다. indexDocumentId와 함께 보내지 마세요.",
    examples: ["1~2", "153~158", "22~30"],
  })),
  keyword: Schema.optional(Schema.String.annotations({
    description: "원천 측 섹션 highlight에 사용할 선택 검색어입니다. searchWord로 매핑됩니다.",
    examples: ["리스"],
  })),
});
export type GetSectionRawInput = typeof GetSectionRequestSchema.Encoded;
export type GetSectionRequest = typeof GetSectionRequestSchema.Type;

export const resolveGetSectionRequest = (
  input: Partial<GetSectionRawInput> & Record<string, unknown>,
): GetSectionRequest => {
  assertObjectInput(input);
  assertNoUnknownKeys(input, fields);
  const keyword = readOptionalString(input, "keyword");
  const indexDocumentId = readOptionalString(input, "indexDocumentId");
  const ref = readOptionalString(input, "ref");
  if (indexDocumentId === undefined && ref === undefined) {
    throw new InvalidCapabilityRequest({
      parameter: "indexDocumentId",
      message: "필수 매개변수 \"indexDocumentId\" 또는 \"ref\" 중 정확히 하나가 필요합니다. \"indexDocumentId\"는 get-standard-structure 결과에서 가져오며, 브라우저 경로의 titleDocumentId는 사용할 수 없습니다.",
    });
  }
  if (indexDocumentId !== undefined && ref !== undefined) {
    throw new InvalidCapabilityRequest({
      parameter: "ref",
      message: "매개변수 \"indexDocumentId\"와 \"ref\" 중 정확히 하나만 사용할 수 있습니다.",
    });
  }
  return {
    stdNum: readRequiredString(input, "stdNum"),
    ...(indexDocumentId === undefined ? {} : { indexDocumentId }),
    ...(ref === undefined ? {} : { ref }),
    ...(keyword === undefined ? {} : { keyword }),
  };
};

export const SectionClauseSchema = Schema.Struct({
  kind: Schema.Literal("paragraph", "title", "unknown").annotations({
    description: "정규화된 clause 종류입니다: paragraph content, title row, unknown source row.",
    examples: ["paragraph"],
  }),
  title: Schema.optional(Schema.String.annotations({
    description: "원천이 제공한 경우 title clause의 제목 text입니다.",
    examples: ["목적"],
  })),
  uniqueKey: Schema.optional(Schema.String.annotations({
    description: "확인 가능한 경우 {stdNum}-{paraNum} 형식의 파생 문단 key입니다.",
    examples: ["1116-23"],
  })),
  stdNum: StdNumSchema,
  paraNum: Schema.optional(ParaNumSchema),
  indexDocumentId: IndexDocumentIdSchema,
  paraContent: Schema.optional(Schema.String.annotations({
    description: "검증을 위해 보존한 원천 문단 HTML fragment입니다.",
  })),
  fullContent: Schema.optional(Schema.String.annotations({
    description: "원천에서 정규화한 plain-text 문단 content입니다.",
  })),
  sort: Schema.optional(Schema.Number.annotations({
    description: "제공되는 경우 섹션 안 표시 순서에 사용할 원천 ordering 값입니다.",
    examples: [1],
  })),
  faqDocNumbers: Schema.optional(Schema.String.annotations({
    description: "제공되는 경우 이 clause와 연결된 원천 FAQ/Q&A document-number 참조입니다.",
    examples: ["SSI-35629"],
  })),
  faqCount: Schema.optional(Schema.Number.annotations({
    description: "제공되는 경우 이 clause와 연결된 원천 FAQ/Q&A 참조 개수입니다.",
    examples: [1],
  })),
}).annotations({ description: "섹션에서 반환된 순서 있는 title 또는 paragraph row 하나입니다." });
export type SectionClause = typeof SectionClauseSchema.Type;

export const GetSectionResultSchema = Schema.Struct({
  result: Schema.Struct({
    request: GetSectionRequestSchema.annotations({ description: "이 결과를 만든 정규화된 request입니다." }),
    section: Schema.Struct({
      stdNum: StdNumSchema,
      indexDocumentId: IndexDocumentIdSchema,
      standardTitle: Schema.optional(Schema.String.annotations({
        description: "구조 index에서 확인할 수 있을 때 제공하는 best-effort 포함 기준서 제목입니다.",
        examples: ["기업회계기준서 제1116호 리스"],
      })),
      standardKind: Schema.optional(Schema.String.annotations({
        description: "구조 index에서 확인할 수 있을 때 제공하는 best-effort 기준서 계열 또는 framework label입니다.",
        examples: ["k-ifrs-standard"],
      })),
      title: Schema.String.annotations({
        description: "확인된 섹션 제목입니다.",
        examples: ["목적"],
      }),
      ref: Schema.optional(Schema.String.annotations({
        description: "확인 가능한 경우 resolved 섹션 문단 범위 또는 참조 label입니다.",
        examples: ["1~2"],
      })),
      level: Schema.optional(Schema.Number.annotations({
        description: "확인 가능한 경우 구조 tree 안의 resolved 섹션 깊이입니다.",
        examples: [2],
      })),
      sort: Schema.optional(Schema.Number.annotations({
        description: "확인 가능한 경우 resolved 섹션의 원천 ordering 값입니다.",
        examples: [1],
      })),
    }).annotations({ description: "확인된 섹션 metadata입니다." }),
    clauses: Schema.Array(SectionClauseSchema).annotations({
      description: "title clause와 paragraph clause를 포함한 순서 있는 섹션 row입니다.",
    }),
  }).annotations({ description: "섹션 조회 payload입니다." }),
  metadata: ResultMetadataSchema,
  references: Schema.Struct({
    stdNum: StdNumSchema,
    indexDocumentId: IndexDocumentIdSchema,
    standardTitle: Schema.optional(Schema.String.annotations({
      description: "확인 가능한 경우 best-effort 포함 기준서 제목입니다.",
      examples: ["기업회계기준서 제1116호 리스"],
    })),
    standardKind: Schema.optional(Schema.String.annotations({
      description: "확인 가능한 경우 best-effort 기준서 계열 또는 framework label입니다.",
      examples: ["k-ifrs-standard"],
    })),
    sectionTitle: Schema.optional(Schema.String.annotations({
      description: "확인 가능한 경우 resolved 섹션 제목입니다.",
      examples: ["목적"],
    })),
    sectionRef: Schema.optional(Schema.String.annotations({
      description: "확인 가능한 경우 resolved 섹션 문단 범위 또는 참조 label입니다.",
      examples: ["1~2"],
    })),
    sectionUrl: SourceUrlSchema,
  }).annotations({ description: "resolved 섹션에 대한 operation-level 원천 참조입니다." }),
  warnings: Schema.Array(
    Schema.Struct({
      code: Schema.Literal(
        "ambiguous_ref_resolved",
        "empty_section",
        "partial_clause_normalization",
      ),
      message: Schema.String.annotations({ description: "사람이 읽을 수 있는 warning 상세입니다." }),
    }),
  ),
});
export type GetSectionResult = typeof GetSectionResultSchema.Type;
