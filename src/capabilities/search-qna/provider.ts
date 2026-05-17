import type { SearchQnaRequest, SearchQnaResult } from "./contract.ts";

export type SearchQnaProvider = {
  readonly search: (request: SearchQnaRequest) => Promise<SearchQnaResult>;
};
