import { toKasbFailure, type KasbExecutionContext } from "../types.ts";
import {
  resolveGetSectionRequest,
  type GetSectionRawInput,
  type GetSectionResult,
} from "./contract.ts";
import type { GetSectionProvider } from "./provider.ts";

export const executeGetSection = async (
  input: Partial<GetSectionRawInput> & Record<string, unknown>,
  provider: GetSectionProvider,
  context?: KasbExecutionContext,
): Promise<GetSectionResult> => {
  try {
    return await provider.getSection(resolveGetSectionRequest(input), context);
  } catch (error) {
    throw toKasbFailure(error, "Unexpected error while retrieving a KASB standard section.");
  }
};
