import type { KasbExecutionContext } from "../types.ts";
import type { GetStandardStructureRequest, GetStandardStructureResult } from "./contract.ts";

export type GetStandardStructureProvider = {
  readonly getStructure: (
    request: GetStandardStructureRequest,
    context?: KasbExecutionContext,
  ) => Promise<GetStandardStructureResult>;
};
