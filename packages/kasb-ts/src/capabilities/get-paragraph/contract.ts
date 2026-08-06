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
const ExactParaNumSchema = ParaNumSchema.pipe(Schema.pattern(/^[^~]*$/u)).annotations({
  description: "Exact paragraph reference within one standard; ranges belong to get-section ref.",
  examples: ["23", "한2.1", "B3", "BC240A"],
});

export const GetParagraphRequestSchema = Schema.Struct({
  stdNum: StdNumSchema.annotations({
    description: "KASB standard number containing the paragraph to retrieve.",
    examples: ["1116"],
  }),
  paraNum: ExactParaNumSchema,
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
      message: "Parameter \"paraNum\" must be one exact paragraph number. Retrieve paragraph ranges with get-section ref.",
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
    description: "Derived paragraph key in {stdNum}-{paraNum} form.",
    examples: ["1116-23"],
  }),
  indexDocumentId: IndexDocumentIdSchema.annotations({
    description: "Required parent retrieval-facing section id returned by source paragraph lookup.",
    examples: ["bdbwhT"],
  }),
  standardTitle: Schema.optional(Schema.String.annotations({
    description: "Best-effort containing standard title when it can be checked in the structure index.",
    examples: ["기업회계기준서 제1116호 리스"],
  })),
  standardKind: Schema.optional(Schema.String.annotations({
    description: "Best-effort standard family or framework label when it can be checked in the structure index.",
    examples: ["k-ifrs-standard"],
  })),
  sectionTitle: Schema.optional(Schema.String.annotations({
    description: "Best-effort parent section title when it can be checked in the structure index.",
    examples: ["최초 측정"],
  })),
  sectionRef: Schema.optional(Schema.String.annotations({
    description: "Best-effort parent section paragraph range or reference label, when available.",
    examples: ["23~28"],
  })),
  paraContent: Schema.String.annotations({
    description: "Source paragraph HTML fragment preserved for verification.",
  }),
  fullContent: Schema.String.annotations({
    description: "Plain-text paragraph content normalized from the source.",
  }),
  sort: Schema.optional(Schema.Number.annotations({
    description: "Source ordering value for the paragraph, when provided.",
    examples: [23],
  })),
  faqDocNumbers: Schema.optional(Schema.String.annotations({
    description: "Source FAQ/Q&A document-number reference linked to this paragraph, when provided.",
    examples: ["SSI-35629"],
  })),
  faqCount: Schema.optional(Schema.Number.annotations({
    description: "Number of source FAQ/Q&A references linked to this paragraph, when provided.",
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
      description: "Derived paragraph key in {stdNum}-{paraNum} form.",
      examples: ["1116-23"],
    }),
    indexDocumentId: IndexDocumentIdSchema,
    standardTitle: Schema.optional(Schema.String.annotations({
      description: "Best-effort containing standard title, when available.",
      examples: ["기업회계기준서 제1116호 리스"],
    })),
    standardKind: Schema.optional(Schema.String.annotations({
      description: "Best-effort standard family or framework label, when available.",
      examples: ["k-ifrs-standard"],
    })),
    sectionTitle: Schema.optional(Schema.String.annotations({
      description: "Best-effort parent section title, when available.",
      examples: ["최초 측정"],
    })),
    sectionRef: Schema.optional(Schema.String.annotations({
      description: "Best-effort parent section paragraph range or reference label, when available.",
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
