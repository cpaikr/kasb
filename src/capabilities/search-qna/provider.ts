import type { KasbExecutionContext } from "../types.ts";
import type { SearchQnaRequest, SearchQnaResult } from "./contract.ts";

export type SearchQnaProvider = {
  readonly search: (
    request: SearchQnaRequest,
    context?: KasbExecutionContext,
  ) => Promise<SearchQnaResult>;
};
