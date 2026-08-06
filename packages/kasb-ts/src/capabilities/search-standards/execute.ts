import { toKasbFailure, type KasbExecutionContext } from "../types.ts";
import {
  resolveSearchStandardsRequest,
  type SearchStandardsRawInput,
  type SearchStandardsResult,
} from "./contract.ts";
import type { SearchStandardsProvider } from "./provider.ts";

export const executeSearchStandards = async (
  input: Partial<SearchStandardsRawInput> & Record<string, unknown>,
  provider: SearchStandardsProvider,
  context?: KasbExecutionContext,
): Promise<SearchStandardsResult> => {
  try {
    return await provider.search(resolveSearchStandardsRequest(input), context);
  } catch (error) {
    throw toKasbFailure(error, "Unexpected error while searching KASB standards.");
  }
};
