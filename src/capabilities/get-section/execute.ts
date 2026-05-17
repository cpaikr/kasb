import { toKasbFailure } from "../types.ts";
import {
  resolveGetSectionRequest,
  type GetSectionRawInput,
  type GetSectionResult,
} from "./contract.ts";
import type { GetSectionProvider } from "./provider.ts";

export const executeGetSection = async (
  input: Partial<GetSectionRawInput> & Record<string, unknown>,
  provider: GetSectionProvider,
): Promise<GetSectionResult> => {
  try {
    return await provider.getSection(resolveGetSectionRequest(input));
  } catch (error) {
    throw toKasbFailure(error, "KASB 기준서 섹션 조회 중 예상하지 못한 오류가 발생했습니다.");
  }
};
