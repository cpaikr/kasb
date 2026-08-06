import { toKasbFailure, type KasbExecutionContext } from "../types.ts";
import {
  resolveSearchQnaRequest,
  type SearchQnaRawInput,
  type SearchQnaResult,
} from "./contract.ts";
import type { SearchQnaProvider } from "./provider.ts";

export const executeSearchQna = async (
  input: Partial<SearchQnaRawInput> & Record<string, unknown>,
  provider: SearchQnaProvider,
  context?: KasbExecutionContext,
): Promise<SearchQnaResult> => {
  try {
    return await provider.search(resolveSearchQnaRequest(input), context);
  } catch (error) {
    throw toKasbFailure(error, "Unexpected error while searching KASB Q&A.");
  }
};
