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
    description: "Section ref/range from get-standard-structure used as an alternate locator when indexDocumentId is unknown. Do not send it together with indexDocumentId.",
    examples: ["1~2", "153~158", "22~30"],
  })),
  keyword: Schema.optional(Schema.String.annotations({
    description: "Optional keyword for source-side section highlighting. Maps to searchWord.",
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
      message: "Exactly one of required parameters \"indexDocumentId\" or \"ref\" is required. \"indexDocumentId\" comes from get-standard-structure results; browser-route titleDocumentId cannot be used.",
    });
  }
  if (indexDocumentId !== undefined && ref !== undefined) {
    throw new InvalidCapabilityRequest({
      parameter: "ref",
      message: "Use exactly one of parameters \"indexDocumentId\" and \"ref\".",
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
    description: "Title text for a title clause, when provided by the source.",
    examples: ["목적"],
  })),
  uniqueKey: Schema.optional(Schema.String.annotations({
    description: "Derived paragraph key in {stdNum}-{paraNum} form, when available.",
    examples: ["1116-23"],
  })),
  stdNum: StdNumSchema,
  paraNum: Schema.optional(ParaNumSchema),
  indexDocumentId: IndexDocumentIdSchema,
  paraContent: Schema.optional(Schema.String.annotations({
    description: "Source paragraph HTML fragment preserved for verification.",
  })),
  fullContent: Schema.optional(Schema.String.annotations({
    description: "Plain-text paragraph content normalized from the source.",
  })),
  sort: Schema.optional(Schema.Number.annotations({
    description: "Source ordering value for display order within the section, when provided.",
    examples: [1],
  })),
  faqDocNumbers: Schema.optional(Schema.String.annotations({
    description: "Source FAQ/Q&A document-number reference linked to this clause, when provided.",
    examples: ["SSI-35629"],
  })),
  faqCount: Schema.optional(Schema.Number.annotations({
    description: "Number of source FAQ/Q&A references linked to this clause, when provided.",
    examples: [1],
  })),
}).annotations({ description: "One ordered title or paragraph row returned from a section." });
export type SectionClause = typeof SectionClauseSchema.Type;

export const GetSectionResultSchema = Schema.Struct({
  result: Schema.Struct({
    request: GetSectionRequestSchema.annotations({ description: "Normalized request that produced this result." }),
    section: Schema.Struct({
      stdNum: StdNumSchema,
      indexDocumentId: IndexDocumentIdSchema,
      standardTitle: Schema.optional(Schema.String.annotations({
        description: "Best-effort containing standard title when it can be checked in the structure index.",
        examples: ["기업회계기준서 제1116호 리스"],
      })),
      standardKind: Schema.optional(Schema.String.annotations({
        description: "Best-effort standard family or framework label when it can be checked in the structure index.",
        examples: ["k-ifrs-standard"],
      })),
      title: Schema.String.annotations({
        description: "Resolved section title.",
        examples: ["목적"],
      }),
      ref: Schema.optional(Schema.String.annotations({
        description: "Resolved section paragraph range or reference label, when available.",
        examples: ["1~2"],
      })),
      level: Schema.optional(Schema.Number.annotations({
        description: "Resolved section depth in the structure tree, when available.",
        examples: [2],
      })),
      sort: Schema.optional(Schema.Number.annotations({
        description: "Source ordering value for the resolved section, when available.",
        examples: [1],
      })),
    }).annotations({ description: "Resolved section metadata." }),
    clauses: Schema.Array(SectionClauseSchema).annotations({
      description: "Ordered section rows including title clauses and paragraph clauses.",
    }),
  }).annotations({ description: "Section retrieval payload." }),
  metadata: ResultMetadataSchema,
  references: Schema.Struct({
    stdNum: StdNumSchema,
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
      description: "Resolved section title, when available.",
      examples: ["목적"],
    })),
    sectionRef: Schema.optional(Schema.String.annotations({
      description: "Resolved section paragraph range or reference label, when available.",
      examples: ["1~2"],
    })),
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
