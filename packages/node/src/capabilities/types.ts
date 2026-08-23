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
  description: "Retrieval-facing section id returned by get-standard-structure and accepted by get-section. Browser-route titleDocumentId values are not allowed.",
  examples: ["ZB2hJW"],
});

export const ParaNumSchema = Schema.String.pipe(Schema.minLength(1)).annotations({
  description: "Paragraph reference within one standard. get-paragraph accepts numeric, Korean-prefixed, appendix, and basis-for-conclusions forms.",
  examples: ["23", "한2.1", "B3", "BC240A"],
});

export const DocNumberSchema = Schema.String.pipe(Schema.minLength(1)).annotations({
  description: "KASB Q&A document number used by search-qna and get-qna.",
  examples: ["SSI-35629"],
});

export const SourceUrlSchema = Schema.String.annotations({
  description: "KASB API URL used to generate or verify this result.",
  examples: ["https://db.kasb.or.kr/api/paragraphs/content/1116/23"],
});

export const SourceReferenceSchema = Schema.Struct({
  apiUrl: SourceUrlSchema,
}).annotations({ description: "Source API reference for a returned item." });
export type SourceReference = typeof SourceReferenceSchema.Type;

export const ResultMetadataSchema = Schema.Struct({
  fetchedAt: Schema.String.annotations({
    description: "ISO timestamp when the source response was fetched or normalized.",
    examples: ["2026-05-18T00:00:00.000Z"],
  }),
  source: Schema.Struct({
    system: Schema.Literal("kasb").annotations({ description: "Source system identifier." }),
    endpoint: Schema.String.annotations({
      description: "Absolute KASB API request URL used by this operation.",
      examples: ["https://db.kasb.or.kr/api/paragraphs/content/1116/23"],
    }),
  }).annotations({ description: "Source endpoint metadata." }),
  sourceBehavior: Schema.Struct({
    observationStatus: Schema.Literal("observed").annotations({
      description: "Indicates that source behavior is based on observed public KASB API behavior.",
    }),
    apiBase: Schema.Literal("https://db.kasb.or.kr/api").annotations({
      description: "Observed KASB JSON API base URL.",
    }),
  }).annotations({ description: "Observed source-behavior metadata." }),
  completeness: Schema.Literal("complete", "partial").annotations({
    description: "Whether the returned payload is complete or only partially normalized/retrieved.",
    examples: ["complete"],
  }),
  content: Schema.optional(Schema.Struct({
    htmlFields: Schema.optional(Schema.Array(Schema.String).annotations({
      description: "Result field path where a source HTML fragment is intentionally preserved for verification.",
      examples: [["result.paragraph.paraContent"]],
    })),
    textFields: Schema.optional(Schema.Array(Schema.String).annotations({
      description: "Result field path normalized to plain text from source HTML or rich text.",
      examples: [["result.paragraph.fullContent"]],
    })),
    notes: Schema.optional(Schema.Array(Schema.String).annotations({
      description: "Routine content-format note that is recorded but does not require a warning.",
    })),
  }).annotations({ description: "Content-format metadata for expected HTML preservation or text normalization." })),
}).annotations({ description: "Operation metadata for source access and normalization completeness." });
export type ResultMetadata = typeof ResultMetadataSchema.Type;

export class InvalidCapabilityRequest extends Error {
  override readonly name = "InvalidCapabilityRequest";
  readonly parameter: string;

  constructor(input: { readonly parameter: string; readonly message: string }) {
    super(input.message);
    this.parameter = input.parameter;
  }
}
