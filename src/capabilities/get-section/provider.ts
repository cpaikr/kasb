import type { GetSectionRequest, GetSectionResult } from "./contract.ts";

export type GetSectionProvider = {
  readonly getSection: (request: GetSectionRequest) => Promise<GetSectionResult>;
};
