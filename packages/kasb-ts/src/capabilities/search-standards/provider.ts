import type { KasbExecutionContext } from "../types.ts";
import type {
  SearchStandardsRequest,
  SearchStandardsResult,
} from "./contract.ts";

export type SearchStandardsProvider = {
  readonly search: (
    request: SearchStandardsRequest,
    context?: KasbExecutionContext,
  ) => Promise<SearchStandardsResult>;
};
