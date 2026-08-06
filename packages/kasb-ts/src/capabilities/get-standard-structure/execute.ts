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
    throw toKasbFailure(error, "Unexpected error while retrieving a KASB standard structure.");
  }
};
