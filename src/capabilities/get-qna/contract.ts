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
    description: "원천 측 Q&A highlight에 사용할 선택 검색어입니다. searchWord로 매핑됩니다.",
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
      message: "매개변수 \"docNumber\"은(는) KASB Q&A의 전체 문서 번호여야 합니다. 숫자만 있는 값은 보통 부족합니다. search-qna로 전체 docNumber(예: SSI-35629)를 확인한 뒤 get-qna에 전달하세요.",
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
    description: "Q&A API가 제공할 때의 내부 numeric source id입니다. 공개 조회에는 docNumber를 사용하세요.",
    examples: [4717],
  })),
  type: Schema.Number.annotations({
    description: "원천-facing Q&A type id입니다.",
    examples: [15],
  }),
  typeLabel: Schema.String.annotations({
    description: "원천 type metadata에서 파생한 관찰된 human-readable Q&A type label입니다.",
    examples: ["K-IFRS · 신속처리질의"],
  }),
  title: Schema.String.annotations({
    description: "원천 highlight를 text로 정규화한 Q&A 문서 제목입니다.",
    examples: ["리스 개시일과 계약일"],
  }),
  reference: Schema.optional(Schema.String.annotations({
    description: "Q&A 문서가 제공하는 경우 원천 reference text입니다.",
  })),
  fullContent: Schema.String.annotations({
    description: "원천에서 정규화한 plain-text Q&A 본문입니다.",
  }),
  contentHtml: Schema.optional(Schema.String.annotations({
    description: "API가 반환할 때 검증을 위해 보존한 원천 Q&A HTML 본문입니다.",
  })),
  relStds: Schema.optional(Schema.String.annotations({
    description: "API가 반환할 때 보존한 원천 관련 기준서 HTML fragment입니다.",
  })),
  tags: Schema.Array(Schema.String.annotations({
    description: "Q&A 문서에 붙은 원천 tag입니다.",
    examples: ["리스개시일"],
  })).annotations({ description: "Q&A 원천 tag입니다." }),
  contentLink: Schema.optional(Schema.String.annotations({
    description: "확인 가능한 경우 원천이 제공한 content link입니다. KASB JSON API 밖을 가리킬 수 있습니다.",
    examples: ["https://facility-qnas.s3.ap-northeast-2.amazonaws.com/kasb/quick/kifrs/html/35629.html"],
  })),
  publishDate: Schema.optional(Schema.String.annotations({
    description: "확인 가능한 경우 원천 publication date string입니다.",
    examples: ["2019-12-23T15:00:00.000Z"],
  })),
  deprecated: Schema.Boolean.annotations({
    description: "원천이 이 Q&A 문서를 deprecated 또는 superseded로 표시하는지 여부입니다.",
    examples: [false],
  }),
  prevDocNumber: Schema.optional(DocNumberSchema.annotations({
    description: "확인 가능한 경우 원천이 제공한 이전 인접 Q&A 문서 번호입니다.",
    examples: ["SSI-35627"],
  })),
  nextDocNumber: Schema.optional(DocNumberSchema.annotations({
    description: "확인 가능한 경우 원천이 제공한 다음 인접 Q&A 문서 번호입니다.",
    examples: ["SSI-35628"],
  })),
}).annotations({ description: "전체 Q&A 문서 결과입니다." });
export type Qna = typeof QnaSchema.Type;

export const GetQnaResultSchema = Schema.Struct({
  result: Schema.Struct({
    request: GetQnaRequestSchema.annotations({ description: "이 결과를 만든 정규화된 request입니다." }),
    qna: QnaSchema,
  }).annotations({ description: "Q&A 문서 조회 payload입니다." }),
  metadata: ResultMetadataSchema,
  references: Schema.Struct({
    docNumber: DocNumberSchema,
    qnaUrl: SourceUrlSchema,
  }).annotations({ description: "Q&A 문서에 대한 operation-level 원천 참조입니다." }),
  warnings: Schema.Array(
    Schema.Struct({
      code: Schema.Literal("source_metadata_incomplete"),
      message: Schema.String.annotations({ description: "사람이 읽을 수 있는 warning 상세입니다." }),
    }),
  ),
});
export type GetQnaResult = typeof GetQnaResultSchema.Type;
