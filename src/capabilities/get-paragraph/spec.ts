import { capabilitySchemaToJsonSchema } from "../types.ts";
import { GetParagraphRequestSchema, GetParagraphResultSchema } from "./contract.ts";

export const getParagraphOperationName = "get-paragraph";
export const getParagraphInputJsonSchema = capabilitySchemaToJsonSchema(
  GetParagraphRequestSchema,
);
export const getParagraphResultJsonSchema = capabilitySchemaToJsonSchema(
  GetParagraphResultSchema,
);
