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
  description: "KASB standard number used as the stable standard-level identifier.",
  examples: ["1116"],
});

export const IndexDocumentIdSchema = Schema.String.pipe(Schema.minLength(1)).annotations({
  description: "Retrieval-facing section id returned by get-standard-structure and accepted by get-section; browser route titleDocumentId values are not accepted.",
  examples: ["ZB2hJW"],
});

export const ParaNumSchema = Schema.String.pipe(Schema.minLength(1)).annotations({
  description: "Paragraph reference within one standard; accepts numeric, Korean-prefixed, appendix, and basis-for-conclusions forms for get-paragraph.",
  examples: ["23", "한2.1", "B3", "BC240A"],
});

export const DocNumberSchema = Schema.String.pipe(Schema.minLength(1)).annotations({
  description: "KASB Q&A document id used by search-qna and get-qna.",
  examples: ["SSI-35629"],
});

export const SourceUrlSchema = Schema.String.annotations({
  description: "KASB API URL used to produce or verify this result.",
  examples: ["https://db.kasb.or.kr/api/paragraphs/content/1116/23"],
});

export const SourceReferenceSchema = Schema.Struct({
  apiUrl: SourceUrlSchema,
}).annotations({ description: "Source API reference for a returned item." });
export type SourceReference = typeof SourceReferenceSchema.Type;

export const ResultMetadataSchema = Schema.Struct({
  fetchedAt: Schema.String.annotations({
    description: "ISO timestamp for when the source response was fetched or normalized.",
    examples: ["2026-05-18T00:00:00.000Z"],
  }),
  source: Schema.Struct({
    system: Schema.Literal("kasb").annotations({ description: "Source system identifier." }),
    endpoint: Schema.String.annotations({
      description: "KASB API endpoint family used by the operation.",
      examples: ["/api/paragraphs/content/{stdNum}/{paraNum}"],
    }),
  }).annotations({ description: "Source endpoint metadata." }),
  sourceBehavior: Schema.Struct({
    observationStatus: Schema.Literal("observed").annotations({
      description: "Indicates that source behavior is based on observed public KASB API behavior.",
    }),
    apiBase: Schema.Literal("https://db.kasb.or.kr/api").annotations({
      description: "Observed KASB JSON API base URL.",
    }),
  }).annotations({ description: "Observed-source behavior metadata." }),
  completeness: Schema.Literal("complete", "partial").annotations({
    description: "Whether the returned payload is complete or only partially normalized/retrieved.",
    examples: ["complete"],
  }),
  content: Schema.optional(Schema.Struct({
    htmlFields: Schema.optional(Schema.Array(Schema.String).annotations({
      description: "Result field paths that intentionally preserve source HTML fragments for verification.",
      examples: [["result.paragraph.paraContent"]],
    })),
    textFields: Schema.optional(Schema.Array(Schema.String).annotations({
      description: "Result field paths normalized to plain text from source HTML or source rich text.",
      examples: [["result.paragraph.fullContent"]],
    })),
    notes: Schema.optional(Schema.Array(Schema.String).annotations({
      description: "Routine content-format notes that are not action-worthy warnings.",
    })),
  }).annotations({ description: "Content formatting metadata for expected HTML preservation or text normalization." })),
}).annotations({ description: "Operation metadata about source access and normalization completeness." });
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
