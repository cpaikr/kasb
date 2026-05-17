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

export const SourceReferenceSchema = Schema.Struct({
  apiUrl: Schema.String,
});
export type SourceReference = typeof SourceReferenceSchema.Type;

export const ResultMetadataSchema = Schema.Struct({
  fetchedAt: Schema.String,
  source: Schema.Struct({
    system: Schema.Literal("kasb"),
    endpoint: Schema.String,
  }),
  sourceBehavior: Schema.Struct({
    observationStatus: Schema.Literal("observed"),
    apiBase: Schema.Literal("https://db.kasb.or.kr/api"),
  }),
  completeness: Schema.Literal("complete", "partial"),
});
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
