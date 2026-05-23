import { Schema } from "effect";

import {
  assertNoUnknownKeys,
  assertObjectInput,
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

const fields = new Set(["stdNum", "paraNum"]);

export const GetParagraphRequestSchema = Schema.Struct({
  stdNum: StdNumSchema.annotations({
    description: "조회할 문단이 포함된 KASB 기준서 번호입니다.",
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
  const paraNum = readRequiredString(input, "paraNum");
  if (paraNum.includes("~")) {
    throw new InvalidCapabilityRequest({
      parameter: "paraNum",
      message: "매개변수 \"paraNum\"은(는) 정확한 문단 번호 하나여야 합니다. 문단 범위는 get-section --ref로 조회하세요.",
    });
  }
  return {
    stdNum: readRequiredString(input, "stdNum"),
    paraNum,
  };
};

export const ParagraphSchema = Schema.Struct({
  stdNum: StdNumSchema,
  paraNum: ParaNumSchema,
  uniqueKey: Schema.String.annotations({
    description: "{stdNum}-{paraNum} 형식의 파생 문단 key입니다.",
    examples: ["1116-23"],
  }),
  indexDocumentId: IndexDocumentIdSchema.annotations({
    description: "확인 가능한 경우 원천 문단 조회가 반환한 상위 조회용 섹션 ID입니다.",
    examples: ["bdbwhT"],
  }),
  standardTitle: Schema.optional(Schema.String.annotations({
    description: "구조 index에서 확인할 수 있을 때 제공하는 best-effort 포함 기준서 제목입니다.",
    examples: ["기업회계기준서 제1116호 리스"],
  })),
  standardKind: Schema.optional(Schema.String.annotations({
    description: "구조 index에서 확인할 수 있을 때 제공하는 best-effort 기준서 계열 또는 framework label입니다.",
    examples: ["k-ifrs-standard"],
  })),
  sectionTitle: Schema.optional(Schema.String.annotations({
    description: "구조 index에서 확인할 수 있을 때 제공하는 best-effort 상위 섹션 제목입니다.",
    examples: ["최초 측정"],
  })),
  sectionRef: Schema.optional(Schema.String.annotations({
    description: "확인 가능한 경우 best-effort 상위 섹션 문단 범위 또는 참조 label입니다.",
    examples: ["23~28"],
  })),
  paraContent: Schema.String.annotations({
    description: "검증을 위해 보존한 원천 문단 HTML fragment입니다.",
  }),
  fullContent: Schema.String.annotations({
    description: "원천에서 정규화한 plain-text 문단 content입니다.",
  }),
  sort: Schema.optional(Schema.Number.annotations({
    description: "제공되는 경우 문단의 원천 ordering 값입니다.",
    examples: [23],
  })),
  faqDocNumbers: Schema.optional(Schema.String.annotations({
    description: "제공되는 경우 이 문단과 연결된 원천 FAQ/Q&A document-number 참조입니다.",
    examples: ["SSI-35629"],
  })),
  faqCount: Schema.optional(Schema.Number.annotations({
    description: "제공되는 경우 이 문단과 연결된 원천 FAQ/Q&A 참조 개수입니다.",
    examples: [1],
  })),
}).annotations({ description: "정확한 KASB 문단 결과입니다." });
export type Paragraph = typeof ParagraphSchema.Type;

export const GetParagraphResultSchema = Schema.Struct({
  result: Schema.Struct({
    request: GetParagraphRequestSchema.annotations({ description: "이 결과를 만든 정규화된 request입니다." }),
    paragraph: ParagraphSchema,
  }).annotations({ description: "정확한 문단 조회 payload입니다." }),
  metadata: ResultMetadataSchema,
  references: Schema.Struct({
    stdNum: StdNumSchema,
    paraNum: ParaNumSchema,
    uniqueKey: Schema.String.annotations({
      description: "{stdNum}-{paraNum} 형식의 파생 문단 key입니다.",
      examples: ["1116-23"],
    }),
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
      description: "확인 가능한 경우 best-effort 상위 섹션 제목입니다.",
      examples: ["최초 측정"],
    })),
    sectionRef: Schema.optional(Schema.String.annotations({
      description: "확인 가능한 경우 best-effort 상위 섹션 문단 범위 또는 참조 label입니다.",
      examples: ["23~28"],
    })),
    paragraphUrl: SourceUrlSchema,
  }).annotations({ description: "문단에 대한 operation-level citation 및 원천 참조입니다." }),
  warnings: Schema.Array(
    Schema.Struct({
      code: Schema.Literal("paragraph_metadata_incomplete"),
      message: Schema.String.annotations({ description: "사람이 읽을 수 있는 warning 상세입니다." }),
    }),
  ),
});
export type GetParagraphResult = typeof GetParagraphResultSchema.Type;
