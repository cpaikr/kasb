import { toKasbFailure } from "../types.ts";
import {
  resolveSearchStandardsRequest,
  type SearchStandardsRawInput,
  type SearchStandardsResult,
} from "./contract.ts";
import type { SearchStandardsProvider } from "./provider.ts";

export const executeSearchStandards = async (
  input: Partial<SearchStandardsRawInput> & Record<string, unknown>,
  provider: SearchStandardsProvider,
): Promise<SearchStandardsResult> => {
  try {
    return await provider.search(resolveSearchStandardsRequest(input));
  } catch (error) {
    throw toKasbFailure(error, "KASB 기준서 검색 중 예상하지 못한 오류가 발생했습니다.");
  }
};
