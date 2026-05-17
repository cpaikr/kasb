import { capabilitySchemaToJsonSchema } from "../types.ts";
import {
  GetStandardStructureRequestSchema,
  GetStandardStructureResultSchema,
} from "./contract.ts";

export const getStandardStructureOperationName = "get-standard-structure";
export const getStandardStructureInputJsonSchema = capabilitySchemaToJsonSchema(
  GetStandardStructureRequestSchema,
);
export const getStandardStructureResultJsonSchema = capabilitySchemaToJsonSchema(
  GetStandardStructureResultSchema,
);
