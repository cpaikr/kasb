import type { SearchQnaRawInput, SearchQnaResult } from "../capabilities/search-qna/contract.ts";
import { executeSearchQna } from "../capabilities/search-qna/execute.ts";
import type { SearchQnaProvider } from "../capabilities/search-qna/provider.ts";
import { searchQnaInputJsonSchema, searchQnaOperationName, searchQnaResultJsonSchema } from "../capabilities/search-qna/spec.ts";
import { kasbSearchQnaProvider } from "../sources/kasb/provider.ts";

export type SearchQnaOperation = {
  readonly name: typeof searchQnaOperationName;
  readonly inputJsonSchema: typeof searchQnaInputJsonSchema;
  readonly resultJsonSchema: typeof searchQnaResultJsonSchema;
  readonly execute: (input: Partial<SearchQnaRawInput> & Record<string, unknown>) => Promise<SearchQnaResult>;
};

export const createSearchQnaOperation = (provider: SearchQnaProvider): SearchQnaOperation => ({
  name: searchQnaOperationName,
  inputJsonSchema: searchQnaInputJsonSchema,
  resultJsonSchema: searchQnaResultJsonSchema,
  execute: (input) => executeSearchQna(input, provider),
});

export const defaultSearchQnaOperation = createSearchQnaOperation(kasbSearchQnaProvider);
