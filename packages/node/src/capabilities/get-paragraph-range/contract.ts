import { Schema } from "effect";

import { SectionClauseSchema } from "../get-section/contract.ts";
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

const fields = new Set(["stdNum", "from", "to"]);

const BoundarySchema = (description: string, example: string) =>
  ParaNumSchema.pipe(Schema.pattern(/^[^~]+$/u)).annotations({
    description,
    examples: [example],
  });

export const GetParagraphRangeRequestSchema = Schema.Struct({
  stdNum: StdNumSchema.annotations({
    description: "KASB standard number containing the paragraph range.",
    examples: ["1102"],
  }),
  from: BoundarySchema(
    "First exact paragraph of the inclusive range. Must share a namespace (body, B, BC, IE, ...) with to; Korean-added 한 paragraphs belong to the body.",
    "BC339",
  ),
  to: BoundarySchema(
    "Last exact paragraph of the inclusive range, at or after from in KASB source order.",
    "BC346",
  ),
});
export type GetParagraphRangeRawInput = typeof GetParagraphRangeRequestSchema.Encoded;
export type GetParagraphRangeRequest = typeof GetParagraphRangeRequestSchema.Type;

export const resolveGetParagraphRangeRequest = (
  input: Partial<GetParagraphRangeRawInput> & Record<string, unknown>,
): GetParagraphRangeRequest => {
  assertObjectInput(input);
  assertNoUnknownKeys(input, fields);
  const stdNum = readRequiredString(input, "stdNum");
  assertNotUrlDotSegment("stdNum", stdNum);
  const from = readBoundary(input, "from");
  const to = readBoundary(input, "to");
  const fromNamespace = paragraphNamespace(from);
  const toNamespace = paragraphNamespace(to);
  if (fromNamespace !== toNamespace) {
    throw new InvalidCapabilityRequest({
      parameter: "to",
      message: `Parameters "from" and "to" must be in the same paragraph namespace; got ${namespaceLabel(fromNamespace)} and ${namespaceLabel(toNamespace)}.`,
    });
  }
  return { stdNum, from, to };
};

const readBoundary = (
  input: Record<string, unknown>,
  parameter: "from" | "to",
): string => {
  const value = readRequiredString(input, parameter);
  if (value.includes("~")) {
    throw new InvalidCapabilityRequest({
      parameter,
      message: `Parameter "${parameter}" must be one exact paragraph number, not a range.`,
    });
  }
  assertNotUrlDotSegment(parameter, value);
  return value;
};

// Mirrors the Rust boundary: the non-digit prefix before the first digit,
// ignoring a leading 한 marker for Korean-added body paragraphs.
const paragraphNamespace = (paraNum: string): string => {
  const value = paraNum.startsWith("한") ? paraNum.slice(1) : paraNum;
  const digit = value.search(/[0-9]/u);
  return digit === -1 ? value : value.slice(0, digit);
};

const namespaceLabel = (namespace: string): string =>
  namespace === "" ? "the body namespace" : `namespace "${namespace}"`;

const assertNotUrlDotSegment = (parameter: "stdNum" | "from" | "to", value: string): void => {
  if (value === "." || value === "..") {
    throw new InvalidCapabilityRequest({
      parameter,
      message: `Parameter "${parameter}" cannot be a URL dot segment ("." or "..").`,
    });
  }
};

export const ParagraphRangeSectionSchema = Schema.Struct({
  indexDocumentId: IndexDocumentIdSchema,
  title: Schema.String.annotations({
    description: "Section title from the structure index.",
    examples: ["결론도출근거"],
  }),
  ref: Schema.optional(Schema.String.annotations({
    description: "Section paragraph range or reference label, when available.",
    examples: ["BC339~BC345"],
  })),
  level: Schema.Number.annotations({
    description: "Section depth in the structure tree.",
    examples: [2],
  }),
  sectionUrl: SourceUrlSchema,
}).annotations({ description: "One indexed section fetched to assemble the range, in structure order." });
export type ParagraphRangeSection = typeof ParagraphRangeSectionSchema.Type;

export const GetParagraphRangeResultSchema = Schema.Struct({
  result: Schema.Struct({
    request: GetParagraphRangeRequestSchema.annotations({ description: "Normalized request that produced this result." }),
    sections: Schema.Array(ParagraphRangeSectionSchema).annotations({
      description: "Indexed sections fetched to assemble the range, in structure order, from the from boundary's parent until the range is complete; at most 20.",
    }),
    clauses: Schema.Array(SectionClauseSchema).annotations({
      description: "Clauses from paragraph from through paragraph to, inclusive, in source order, with each paragraph once.",
    }),
  }).annotations({ description: "Paragraph range retrieval payload." }),
  metadata: ResultMetadataSchema,
  references: Schema.Struct({
    stdNum: StdNumSchema,
    from: ParaNumSchema,
    to: ParaNumSchema,
    standardTitle: Schema.optional(Schema.String.annotations({
      description: "Best-effort containing standard title, when available.",
      examples: ["기업회계기준서 제1102호 주식기준보상"],
    })),
    standardKind: Schema.optional(Schema.String.annotations({
      description: "Best-effort standard family or framework label, when available.",
      examples: ["k-ifrs-standard"],
    })),
    indexDocumentIds: Schema.Array(IndexDocumentIdSchema).annotations({
      description: "indexDocumentId of each fetched section, in structure order.",
    }),
    structureUrl: SourceUrlSchema,
  }).annotations({ description: "Operation-level citation and source references for the range." }),
  warnings: Schema.Array(
    Schema.Struct({
      code: Schema.Literal("partial_clause_normalization", "source_metadata_incomplete"),
      message: Schema.String.annotations({ description: "Human-readable warning detail." }),
    }),
  ),
});
export type GetParagraphRangeResult = typeof GetParagraphRangeResultSchema.Type;
