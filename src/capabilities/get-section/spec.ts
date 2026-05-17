import { capabilitySchemaToJsonSchema } from "../types.ts";
import { GetSectionRequestSchema, GetSectionResultSchema } from "./contract.ts";

export const getSectionOperationName = "get-section";
export const getSectionInputJsonSchema = capabilitySchemaToJsonSchema(
  GetSectionRequestSchema,
);
export const getSectionResultJsonSchema = capabilitySchemaToJsonSchema(
  GetSectionResultSchema,
);
