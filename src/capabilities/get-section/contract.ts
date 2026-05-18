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
    description: "KASB standard number containing the section to retrieve.",
    examples: ["1116"],
  }),
  indexDocumentId: Schema.optional(IndexDocumentIdSchema),
  ref: Schema.optional(Schema.String.pipe(Schema.minLength(1)).annotations({
    description: "Section ref/range from get-standard-structure used as an alternate lookup when indexDocumentId is unknown; do not send it together with indexDocumentId.",
    examples: ["1~2", "153~158", "22~30"],
  })),
  keyword: Schema.optional(Schema.String.annotations({
    description: "Optional keyword for source-side section highlighting; mapped to searchWord.",
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
    description: "Normalized clause kind: paragraph content, title row, or unknown source row.",
    examples: ["paragraph"],
  }),
  title: Schema.optional(Schema.String.annotations({
    description: "Title text for title clauses when supplied by the source.",
    examples: ["목적"],
  })),
  uniqueKey: Schema.optional(Schema.String.annotations({
    description: "Derived paragraph key in the form {stdNum}-{paraNum} when available.",
    examples: ["1116-23"],
  })),
  stdNum: StdNumSchema,
  paraNum: Schema.optional(ParaNumSchema),
  indexDocumentId: IndexDocumentIdSchema,
  paraContent: Schema.optional(Schema.String.annotations({
    description: "Source paragraph HTML fragment when preserved for verification.",
  })),
  fullContent: Schema.optional(Schema.String.annotations({
    description: "Plain-text paragraph content normalized from the source.",
  })),
  sort: Schema.optional(Schema.Number.annotations({
    description: "Source ordering value for display within the section when provided.",
    examples: [1],
  })),
  faqDocNumbers: Schema.optional(Schema.String.annotations({
    description: "Source FAQ/Q&A document-number references associated with this clause when provided.",
    examples: ["SSI-35629"],
  })),
  faqCount: Schema.optional(Schema.Number.annotations({
    description: "Number of source FAQ/Q&A references associated with this clause when provided.",
    examples: [1],
  })),
}).annotations({ description: "One ordered title or paragraph row returned for a section." });
export type SectionClause = typeof SectionClauseSchema.Type;

export const GetSectionResultSchema = Schema.Struct({
  result: Schema.Struct({
    request: GetSectionRequestSchema.annotations({ description: "Normalized request that produced this result." }),
    section: Schema.Struct({
      stdNum: StdNumSchema,
      indexDocumentId: IndexDocumentIdSchema,
      title: Schema.String.annotations({
        description: "Resolved section title.",
        examples: ["목적"],
      }),
      ref: Schema.optional(Schema.String.annotations({
        description: "Resolved section paragraph range or reference label when available.",
        examples: ["1~2"],
      })),
      level: Schema.optional(Schema.Number.annotations({
        description: "Resolved section depth in the structure tree when available.",
        examples: [2],
      })),
      sort: Schema.optional(Schema.Number.annotations({
        description: "Source ordering value for the resolved section when available.",
        examples: [1],
      })),
    }).annotations({ description: "Resolved section metadata." }),
    clauses: Schema.Array(SectionClauseSchema).annotations({
      description: "Ordered section rows, including title and paragraph clauses.",
    }),
  }).annotations({ description: "Section retrieval payload." }),
  metadata: ResultMetadataSchema,
  references: Schema.Struct({
    stdNum: StdNumSchema,
    indexDocumentId: IndexDocumentIdSchema,
    sectionUrl: SourceUrlSchema,
  }).annotations({ description: "Operation-level source reference for the resolved section." }),
  warnings: Schema.Array(
    Schema.Struct({
      code: Schema.Literal(
        "ambiguous_ref_resolved",
        "empty_section",
        "partial_clause_normalization",
      ),
      message: Schema.String.annotations({ description: "Human-readable warning detail." }),
    }),
  ),
});
export type GetSectionResult = typeof GetSectionResultSchema.Type;
