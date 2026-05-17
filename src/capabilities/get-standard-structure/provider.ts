import type { GetStandardStructureRequest, GetStandardStructureResult } from "./contract.ts";

export type GetStandardStructureProvider = {
  readonly getStructure: (
    request: GetStandardStructureRequest,
  ) => Promise<GetStandardStructureResult>;
};
