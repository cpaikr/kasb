import type { GetSectionRawInput, GetSectionResult } from "../capabilities/get-section/contract.ts";
import { executeGetSection } from "../capabilities/get-section/execute.ts";
import type { GetSectionProvider } from "../capabilities/get-section/provider.ts";
import { getSectionInputJsonSchema, getSectionOperationName, getSectionResultJsonSchema } from "../capabilities/get-section/spec.ts";
import { kasbSectionProvider } from "../sources/kasb/provider.ts";

export type GetSectionOperation = {
  readonly name: typeof getSectionOperationName;
  readonly inputJsonSchema: typeof getSectionInputJsonSchema;
  readonly resultJsonSchema: typeof getSectionResultJsonSchema;
  readonly execute: (input: Partial<GetSectionRawInput> & Record<string, unknown>) => Promise<GetSectionResult>;
};

export const createGetSectionOperation = (provider: GetSectionProvider): GetSectionOperation => ({
  name: getSectionOperationName,
  inputJsonSchema: getSectionInputJsonSchema,
  resultJsonSchema: getSectionResultJsonSchema,
  execute: (input) => executeGetSection(input, provider),
});

export const defaultGetSectionOperation = createGetSectionOperation(kasbSectionProvider);
