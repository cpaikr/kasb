import { toKasbFailure, type KasbExecutionContext } from "../types.ts";
import {
  resolveGetParagraphRequest,
  type GetParagraphRawInput,
  type GetParagraphResult,
} from "./contract.ts";
import type { GetParagraphProvider } from "./provider.ts";

export const executeGetParagraph = async (
  input: Partial<GetParagraphRawInput> & Record<string, unknown>,
  provider: GetParagraphProvider,
  context?: KasbExecutionContext,
): Promise<GetParagraphResult> => {
  try {
    return await provider.getParagraph(resolveGetParagraphRequest(input), context);
  } catch (error) {
    throw toKasbFailure(error, "Unexpected error while retrieving a KASB standard paragraph.");
  }
};
