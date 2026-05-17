import { capabilitySchemaToJsonSchema } from "../types.ts";
import { SearchQnasRequestSchema, SearchQnasResultSchema } from "./contract.ts";

export const searchQnasOperationName = "search-qnas";
export const searchQnasInputJsonSchema = capabilitySchemaToJsonSchema(
  SearchQnasRequestSchema,
);
export const searchQnasResultJsonSchema = capabilitySchemaToJsonSchema(
  SearchQnasResultSchema,
);
