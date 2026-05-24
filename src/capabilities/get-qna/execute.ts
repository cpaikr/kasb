import { toKasbFailure, type KasbExecutionContext } from "../types.ts";
import {
  resolveGetQnaRequest,
  type GetQnaRawInput,
  type GetQnaResult,
} from "./contract.ts";
import type { GetQnaProvider } from "./provider.ts";

export const executeGetQna = async (
  input: Partial<GetQnaRawInput> & Record<string, unknown>,
  provider: GetQnaProvider,
  context?: KasbExecutionContext,
): Promise<GetQnaResult> => {
  try {
    return await provider.getQna(resolveGetQnaRequest(input), context);
  } catch (error) {
    throw toKasbFailure(error, "Unexpected error while retrieving KASB Q&A.");
  }
};
