import { toKasbFailure } from "../types.ts";
import {
  resolveGetParagraphRequest,
  type GetParagraphRawInput,
  type GetParagraphResult,
} from "./contract.ts";
import type { GetParagraphProvider } from "./provider.ts";

export const executeGetParagraph = async (
  input: Partial<GetParagraphRawInput> & Record<string, unknown>,
  provider: GetParagraphProvider,
): Promise<GetParagraphResult> => {
  try {
    return await provider.getParagraph(resolveGetParagraphRequest(input));
  } catch (error) {
    throw toKasbFailure(error, "KASB 기준서 문단 조회 중 예상하지 못한 오류가 발생했습니다.");
  }
};
