import { capabilitySchemaToJsonSchema } from "../types.ts";
import { SearchQnaRequestSchema, SearchQnaResultSchema } from "./contract.ts";

export const searchQnaOperationName = "search-qna";
export const searchQnaInputJsonSchema = capabilitySchemaToJsonSchema(
  SearchQnaRequestSchema,
);
export const searchQnaResultJsonSchema = capabilitySchemaToJsonSchema(
  SearchQnaResultSchema,
);
