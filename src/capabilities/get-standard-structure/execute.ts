import { toKasbFailure, type KasbExecutionContext } from "../types.ts";
import {
  resolveGetStandardStructureRequest,
  type GetStandardStructureRawInput,
  type GetStandardStructureResult,
} from "./contract.ts";
import type { GetStandardStructureProvider } from "./provider.ts";

export const executeGetStandardStructure = async (
  input: Partial<GetStandardStructureRawInput> & Record<string, unknown>,
  provider: GetStandardStructureProvider,
  context?: KasbExecutionContext,
): Promise<GetStandardStructureResult> => {
  try {
    return await provider.getStructure(resolveGetStandardStructureRequest(input), context);
  } catch (error) {
    throw toKasbFailure(error, "KASB 기준서 구조 조회 중 예상하지 못한 오류가 발생했습니다.");
  }
};
