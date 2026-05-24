import { capabilitySchemaToJsonSchema } from "../types.ts";
import { GetSectionRequestSchema, GetSectionResultSchema } from "./contract.ts";

export const getSectionOperationName = "get-section";

const baseGetSectionInputJsonSchema = capabilitySchemaToJsonSchema(
  GetSectionRequestSchema,
);

export const getSectionInputJsonSchema = {
  ...baseGetSectionInputJsonSchema,
  description: "Retrieve one standard section. Provide stdNum and exactly one section locator: indexDocumentId from get-standard-structure, or ref from that same structure when the id is unknown. Browser-route titleDocumentId values are not allowed.",
  oneOf: [
    {
      required: ["indexDocumentId"],
      not: { required: ["ref"] },
      description: "Retrieve by retrieval-facing indexDocumentId returned by get-standard-structure.",
    },
    {
      required: ["ref"],
      not: { required: ["indexDocumentId"] },
      description: "Retrieve by section ref/range returned by get-standard-structure.",
    },
  ],
};

export const getSectionResultJsonSchema = capabilitySchemaToJsonSchema(
  GetSectionResultSchema,
);
