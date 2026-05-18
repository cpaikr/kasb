import { capabilitySchemaToJsonSchema } from "../types.ts";
import { GetSectionRequestSchema, GetSectionResultSchema } from "./contract.ts";

export const getSectionOperationName = "get-section";

const baseGetSectionInputJsonSchema = capabilitySchemaToJsonSchema(
  GetSectionRequestSchema,
);

export const getSectionInputJsonSchema = {
  ...baseGetSectionInputJsonSchema,
  description: "Retrieve one standard section. Provide stdNum and exactly one section locator: indexDocumentId from get-standard-structure, or ref from that structure when the id is unknown. Browser-route titleDocumentId values are not accepted.",
  oneOf: [
    {
      required: ["indexDocumentId"],
      not: { required: ["ref"] },
      description: "Lookup by retrieval-facing indexDocumentId returned from get-standard-structure.",
    },
    {
      required: ["ref"],
      not: { required: ["indexDocumentId"] },
      description: "Lookup by section ref/range returned from get-standard-structure.",
    },
  ],
};

export const getSectionResultJsonSchema = capabilitySchemaToJsonSchema(
  GetSectionResultSchema,
);
