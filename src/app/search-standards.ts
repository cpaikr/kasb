import type { SearchStandardsRawInput, SearchStandardsResult } from "../capabilities/search-standards/contract.ts";
import { executeSearchStandards } from "../capabilities/search-standards/execute.ts";
import type { SearchStandardsProvider } from "../capabilities/search-standards/provider.ts";
import { searchStandardsInputJsonSchema, searchStandardsOperationName, searchStandardsResultJsonSchema } from "../capabilities/search-standards/spec.ts";
import { kasbSearchStandardsProvider } from "../sources/kasb/provider.ts";

export type SearchStandardsOperation = {
  readonly name: typeof searchStandardsOperationName;
  readonly inputJsonSchema: typeof searchStandardsInputJsonSchema;
  readonly resultJsonSchema: typeof searchStandardsResultJsonSchema;
  readonly execute: (input: Partial<SearchStandardsRawInput> & Record<string, unknown>) => Promise<SearchStandardsResult>;
};

export const createSearchStandardsOperation = (provider: SearchStandardsProvider): SearchStandardsOperation => ({
  name: searchStandardsOperationName,
  inputJsonSchema: searchStandardsInputJsonSchema,
  resultJsonSchema: searchStandardsResultJsonSchema,
  execute: (input) => executeSearchStandards(input, provider),
});

export const defaultSearchStandardsOperation = createSearchStandardsOperation(kasbSearchStandardsProvider);
