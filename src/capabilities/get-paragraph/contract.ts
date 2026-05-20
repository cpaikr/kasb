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
    description: "KASB standard number containing the paragraph to retrieve.",
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
    description: "Derived paragraph key in the form {stdNum}-{paraNum}.",
    examples: ["1116-23"],
  }),
  indexDocumentId: IndexDocumentIdSchema.annotations({
    description: "Parent retrieval-facing section id returned by the source paragraph lookup when available.",
    examples: ["bdbwhT"],
  }),
  standardTitle: Schema.optional(Schema.String.annotations({
    description: "Best-effort title of the containing standard when available from the structure index.",
    examples: ["기업회계기준서 제1116호 리스"],
  })),
  standardKind: Schema.optional(Schema.String.annotations({
    description: "Best-effort standard family or framework label when available from the structure index.",
    examples: ["k-ifrs-standard"],
  })),
  sectionTitle: Schema.optional(Schema.String.annotations({
    description: "Best-effort parent section title from the structure index when available.",
    examples: ["최초 측정"],
  })),
  sectionRef: Schema.optional(Schema.String.annotations({
    description: "Best-effort parent section paragraph range or reference label when available.",
    examples: ["23~28"],
  })),
  paraContent: Schema.String.annotations({
    description: "Source paragraph HTML fragment preserved for verification.",
  }),
  fullContent: Schema.String.annotations({
    description: "Plain-text paragraph content normalized from the source.",
  }),
  sort: Schema.optional(Schema.Number.annotations({
    description: "Source ordering value for the paragraph when provided.",
    examples: [23],
  })),
  faqDocNumbers: Schema.optional(Schema.String.annotations({
    description: "Source FAQ/Q&A document-number references associated with this paragraph when provided.",
    examples: ["SSI-35629"],
  })),
  faqCount: Schema.optional(Schema.Number.annotations({
    description: "Number of source FAQ/Q&A references associated with this paragraph when provided.",
    examples: [1],
  })),
}).annotations({ description: "Exact KASB paragraph result." });
export type Paragraph = typeof ParagraphSchema.Type;

export const GetParagraphResultSchema = Schema.Struct({
  result: Schema.Struct({
    request: GetParagraphRequestSchema.annotations({ description: "Normalized request that produced this result." }),
    paragraph: ParagraphSchema,
  }).annotations({ description: "Exact paragraph retrieval payload." }),
  metadata: ResultMetadataSchema,
  references: Schema.Struct({
    stdNum: StdNumSchema,
    paraNum: ParaNumSchema,
    uniqueKey: Schema.String.annotations({
      description: "Derived paragraph key in the form {stdNum}-{paraNum}.",
      examples: ["1116-23"],
    }),
    indexDocumentId: IndexDocumentIdSchema,
    standardTitle: Schema.optional(Schema.String.annotations({
      description: "Best-effort title of the containing standard when available.",
      examples: ["기업회계기준서 제1116호 리스"],
    })),
    standardKind: Schema.optional(Schema.String.annotations({
      description: "Best-effort standard family or framework label when available.",
      examples: ["k-ifrs-standard"],
    })),
    sectionTitle: Schema.optional(Schema.String.annotations({
      description: "Best-effort parent section title when available.",
      examples: ["최초 측정"],
    })),
    sectionRef: Schema.optional(Schema.String.annotations({
      description: "Best-effort parent section paragraph range or reference label when available.",
      examples: ["23~28"],
    })),
    paragraphUrl: SourceUrlSchema,
  }).annotations({ description: "Operation-level citation and source reference for the paragraph." }),
  warnings: Schema.Array(
    Schema.Struct({
      code: Schema.Literal("paragraph_metadata_incomplete"),
      message: Schema.String.annotations({ description: "Human-readable warning detail." }),
    }),
  ),
});
export type GetParagraphResult = typeof GetParagraphResultSchema.Type;
