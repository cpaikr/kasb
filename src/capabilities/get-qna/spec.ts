import { capabilitySchemaToJsonSchema } from "../types.ts";
import { GetQnaRequestSchema, GetQnaResultSchema } from "./contract.ts";

export const getQnaOperationName = "get-qna";
export const getQnaInputJsonSchema = capabilitySchemaToJsonSchema(
  GetQnaRequestSchema,
);
export const getQnaResultJsonSchema = capabilitySchemaToJsonSchema(
  GetQnaResultSchema,
);
