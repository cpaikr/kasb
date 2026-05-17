import type {
  SearchStandardsRequest,
  SearchStandardsResult,
} from "./contract.ts";

export type SearchStandardsProvider = {
  readonly search: (request: SearchStandardsRequest) => Promise<SearchStandardsResult>;
};
