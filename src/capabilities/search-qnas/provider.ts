import type { SearchQnasRequest, SearchQnasResult } from "./contract.ts";

export type SearchQnasProvider = {
  readonly search: (request: SearchQnasRequest) => Promise<SearchQnasResult>;
};
