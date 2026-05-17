import type { SearchQnasRawInput, SearchQnasResult } from "../capabilities/search-qnas/contract.ts";
import { executeSearchQnas } from "../capabilities/search-qnas/execute.ts";
import type { SearchQnasProvider } from "../capabilities/search-qnas/provider.ts";
import { searchQnasInputJsonSchema, searchQnasOperationName, searchQnasResultJsonSchema } from "../capabilities/search-qnas/spec.ts";
import { kasbSearchQnasProvider } from "../sources/kasb/provider.ts";

export type SearchQnasOperation = {
  readonly name: typeof searchQnasOperationName;
  readonly inputJsonSchema: typeof searchQnasInputJsonSchema;
  readonly resultJsonSchema: typeof searchQnasResultJsonSchema;
  readonly execute: (input: Partial<SearchQnasRawInput> & Record<string, unknown>) => Promise<SearchQnasResult>;
};

export const createSearchQnasOperation = (provider: SearchQnasProvider): SearchQnasOperation => ({
  name: searchQnasOperationName,
  inputJsonSchema: searchQnasInputJsonSchema,
  resultJsonSchema: searchQnasResultJsonSchema,
  execute: (input) => executeSearchQnas(input, provider),
});

export const defaultSearchQnasOperation = createSearchQnasOperation(kasbSearchQnasProvider);
