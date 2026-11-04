import { capabilitySchemaToJsonSchema } from "../types.ts";
import { GetParagraphRangeRequestSchema, GetParagraphRangeResultSchema } from "./contract.ts";

export const getParagraphRangeOperationName = "get-paragraph-range";
export const getParagraphRangeInputJsonSchema = capabilitySchemaToJsonSchema(
  GetParagraphRangeRequestSchema,
);
export const getParagraphRangeResultJsonSchema = capabilitySchemaToJsonSchema(
  GetParagraphRangeResultSchema,
);
