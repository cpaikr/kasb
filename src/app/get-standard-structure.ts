import type { GetStandardStructureRawInput, GetStandardStructureResult } from "../capabilities/get-standard-structure/contract.ts";
import { executeGetStandardStructure } from "../capabilities/get-standard-structure/execute.ts";
import type { GetStandardStructureProvider } from "../capabilities/get-standard-structure/provider.ts";
import type { KasbExecutionContext } from "../capabilities/types.ts";
import { getStandardStructureInputJsonSchema, getStandardStructureOperationName, getStandardStructureResultJsonSchema } from "../capabilities/get-standard-structure/spec.ts";
import { kasbStandardStructureProvider } from "../sources/kasb/provider.ts";

export type GetStandardStructureOperation = {
  readonly name: typeof getStandardStructureOperationName;
  readonly inputJsonSchema: typeof getStandardStructureInputJsonSchema;
  readonly resultJsonSchema: typeof getStandardStructureResultJsonSchema;
  readonly execute: (
    input: Partial<GetStandardStructureRawInput> & Record<string, unknown>,
    context?: KasbExecutionContext,
  ) => Promise<GetStandardStructureResult>;
};

export const createGetStandardStructureOperation = (provider: GetStandardStructureProvider): GetStandardStructureOperation => ({
  name: getStandardStructureOperationName,
  inputJsonSchema: getStandardStructureInputJsonSchema,
  resultJsonSchema: getStandardStructureResultJsonSchema,
  execute: (input, context) => executeGetStandardStructure(input, provider, context),
});

export const defaultGetStandardStructureOperation = createGetStandardStructureOperation(kasbStandardStructureProvider);
