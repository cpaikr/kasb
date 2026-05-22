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
    throw toKasbFailure(error, "KASB Q&A 검색 중 예상하지 못한 오류가 발생했습니다.");
  }
};
