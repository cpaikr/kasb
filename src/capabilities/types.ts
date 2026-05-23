import { JSONSchema, Schema } from "effect";

export const capabilitySchemaToJsonSchema = <A, I, R>(
  schema: Schema.Schema<A, I, R>,
): JSONSchema.JsonSchema7Root => ({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  ...JSONSchema.fromAST(schema.ast, {
    definitions: {},
    target: "jsonSchema2020-12",
    topLevelReferenceStrategy: "skip",
  }),
});

export const StdNumSchema = Schema.String.pipe(Schema.minLength(1)).annotations({
  description: "안정적인 기준서 단위 식별자로 사용하는 KASB 기준서 번호입니다.",
  examples: ["1116"],
});

export const IndexDocumentIdSchema = Schema.String.pipe(Schema.minLength(1)).annotations({
  description: "get-standard-structure가 반환하고 get-section이 받는 조회용 섹션 ID입니다. 브라우저 경로의 titleDocumentId 값은 허용되지 않습니다.",
  examples: ["ZB2hJW"],
});

export const ParaNumSchema = Schema.String.pipe(Schema.minLength(1)).annotations({
  description: "하나의 기준서 안에서 쓰는 문단 참조입니다. get-paragraph는 숫자, 한글 접두어, 부록, 결론도출근거 형식을 받습니다.",
  examples: ["23", "한2.1", "B3", "BC240A"],
});

export const DocNumberSchema = Schema.String.pipe(Schema.minLength(1)).annotations({
  description: "search-qna와 get-qna에서 사용하는 KASB Q&A 문서 번호입니다.",
  examples: ["SSI-35629"],
});

export const SourceUrlSchema = Schema.String.annotations({
  description: "이 결과를 생성하거나 검증할 때 사용한 KASB API URL입니다.",
  examples: ["https://db.kasb.or.kr/api/paragraphs/content/1116/23"],
});

export const SourceReferenceSchema = Schema.Struct({
  apiUrl: SourceUrlSchema,
}).annotations({ description: "반환 항목의 원천 API 참조입니다." });
export type SourceReference = typeof SourceReferenceSchema.Type;

export const ResultMetadataSchema = Schema.Struct({
  fetchedAt: Schema.String.annotations({
    description: "원천 응답을 가져오거나 정규화한 시점의 ISO timestamp입니다.",
    examples: ["2026-05-18T00:00:00.000Z"],
  }),
  source: Schema.Struct({
    system: Schema.Literal("kasb").annotations({ description: "원천 시스템 식별자입니다." }),
    endpoint: Schema.String.annotations({
      description: "이 작업이 사용한 KASB API endpoint 계열입니다.",
      examples: ["/api/paragraphs/content/{stdNum}/{paraNum}"],
    }),
  }).annotations({ description: "원천 endpoint metadata입니다." }),
  sourceBehavior: Schema.Struct({
    observationStatus: Schema.Literal("observed").annotations({
      description: "원천 동작이 관찰된 공개 KASB API 동작에 기반함을 나타냅니다.",
    }),
    apiBase: Schema.Literal("https://db.kasb.or.kr/api").annotations({
      description: "관찰된 KASB JSON API base URL입니다.",
    }),
  }).annotations({ description: "관찰된 원천 동작 metadata입니다." }),
  completeness: Schema.Literal("complete", "partial").annotations({
    description: "반환 payload가 완전한지, 일부만 정규화/조회되었는지를 나타냅니다.",
    examples: ["complete"],
  }),
  content: Schema.optional(Schema.Struct({
    htmlFields: Schema.optional(Schema.Array(Schema.String).annotations({
      description: "검증을 위해 원천 HTML fragment를 의도적으로 보존한 result field path입니다.",
      examples: [["result.paragraph.paraContent"]],
    })),
    textFields: Schema.optional(Schema.Array(Schema.String).annotations({
      description: "원천 HTML 또는 rich text에서 plain text로 정규화한 result field path입니다.",
      examples: [["result.paragraph.fullContent"]],
    })),
    notes: Schema.optional(Schema.Array(Schema.String).annotations({
      description: "조치가 필요한 warning은 아니지만 기록할 일반 content-format note입니다.",
    })),
  }).annotations({ description: "예상된 HTML 보존 또는 text 정규화에 관한 content formatting metadata입니다." })),
}).annotations({ description: "원천 접근과 정규화 완전성에 관한 operation metadata입니다." });
export type ResultMetadata = typeof ResultMetadataSchema.Type;

export const KasbFailureCodeSchema = Schema.Literal(
  "invalid_input",
  "not_found",
  "source_unavailable",
  "source_changed",
  "partial_retrieval",
  "internal_failure",
);
export type KasbFailureCode = typeof KasbFailureCodeSchema.Type;

export class KasbFailure extends Schema.TaggedError<KasbFailure>()(
  "KasbFailure",
  {
    code: KasbFailureCodeSchema,
    message: Schema.String,
    retryable: Schema.Boolean,
    parameter: Schema.optional(Schema.String),
    sourceUrl: Schema.optional(Schema.String),
  },
) {}

export class InvalidCapabilityRequest extends Schema.TaggedError<InvalidCapabilityRequest>()(
  "InvalidCapabilityRequest",
  {
    parameter: Schema.String,
    message: Schema.String,
  },
) {}

export type KasbExecutionContext = {
  readonly signal?: AbortSignal;
};

export type ProviderFailureCode =
  | "not_found"
  | "source_unavailable"
  | "source_changed"
  | "partial_retrieval"
  | "internal_failure";

export class ProviderFailure extends Schema.TaggedError<ProviderFailure>()(
  "ProviderFailure",
  {
    code: Schema.Literal(
      "not_found",
      "source_unavailable",
      "source_changed",
      "partial_retrieval",
      "internal_failure",
    ),
    message: Schema.String,
    retryable: Schema.Boolean,
    sourceUrl: Schema.optional(Schema.String),
  },
) {}

export const toKasbFailure = (
  error: unknown,
  fallbackMessage: string,
): KasbFailure => {
  if (error instanceof InvalidCapabilityRequest) {
    return new KasbFailure({
      code: "invalid_input",
      message: error.message,
      retryable: false,
      parameter: error.parameter,
    });
  }

  if (error instanceof ProviderFailure) {
    return new KasbFailure({
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.sourceUrl === undefined ? {} : { sourceUrl: error.sourceUrl }),
    });
  }

  return new KasbFailure({
    code: "internal_failure",
    message: fallbackMessage,
    retryable: false,
  });
};
