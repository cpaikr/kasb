import type { KasbExecutionContext } from "../types.ts";
import type { GetSectionRequest, GetSectionResult } from "./contract.ts";

export type GetSectionProvider = {
  readonly getSection: (
    request: GetSectionRequest,
    context?: KasbExecutionContext,
  ) => Promise<GetSectionResult>;
};
