import type { KasbExecutionContext } from "../types.ts";
import type { GetQnaRequest, GetQnaResult } from "./contract.ts";

export type GetQnaProvider = {
  readonly getQna: (
    request: GetQnaRequest,
    context?: KasbExecutionContext,
  ) => Promise<GetQnaResult>;
};
