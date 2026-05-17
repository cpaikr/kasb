import { toKasbFailure } from "../types.ts";
import {
  resolveSearchQnasRequest,
  type SearchQnasRawInput,
  type SearchQnasResult,
} from "./contract.ts";
import type { SearchQnasProvider } from "./provider.ts";

export const executeSearchQnas = async (
  input: Partial<SearchQnasRawInput> & Record<string, unknown>,
  provider: SearchQnasProvider,
): Promise<SearchQnasResult> => {
  try {
    return await provider.search(resolveSearchQnasRequest(input));
  } catch (error) {
    throw toKasbFailure(error, "KASB Q&A 검색 중 예상하지 못한 오류가 발생했습니다.");
  }
};
