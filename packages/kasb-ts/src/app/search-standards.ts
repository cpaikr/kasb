import type { SearchStandardsRawInput, SearchStandardsResult } from "../capabilities/search-standards/contract.ts";
import { executeSearchStandards } from "../capabilities/search-standards/execute.ts";
import type { SearchStandardsProvider } from "../capabilities/search-standards/provider.ts";
import type { KasbExecutionContext } from "../capabilities/types.ts";
import { searchStandardsInputJsonSchema, searchStandardsOperationName, searchStandardsResultJsonSchema } from "../capabilities/search-standards/spec.ts";
import { kasbSearchStandardsProvider } from "../sources/kasb/provider.ts";

export type SearchStandardsOperation = {
  readonly name: typeof searchStandardsOperationName;
  readonly inputJsonSchema: typeof searchStandardsInputJsonSchema;
  readonly resultJsonSchema: typeof searchStandardsResultJsonSchema;
  readonly execute: (
    input: Partial<SearchStandardsRawInput> & Record<string, unknown>,
    context?: KasbExecutionContext,
  ) => Promise<SearchStandardsResult>;
};

export const createSearchStandardsOperation = (provider: SearchStandardsProvider): SearchStandardsOperation => ({
  name: searchStandardsOperationName,
  inputJsonSchema: searchStandardsInputJsonSchema,
  resultJsonSchema: searchStandardsResultJsonSchema,
  execute: (input, context) => executeSearchStandards(input, provider, context),
});

export const defaultSearchStandardsOperation = createSearchStandardsOperation(kasbSearchStandardsProvider);
