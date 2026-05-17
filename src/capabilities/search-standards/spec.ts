import { capabilitySchemaToJsonSchema } from "../types.ts";
import { SearchStandardsRequestSchema, SearchStandardsResultSchema } from "./contract.ts";

export const searchStandardsOperationName = "search-standards";
export const searchStandardsInputJsonSchema = capabilitySchemaToJsonSchema(
  SearchStandardsRequestSchema,
);
export const searchStandardsResultJsonSchema = capabilitySchemaToJsonSchema(
  SearchStandardsResultSchema,
);
