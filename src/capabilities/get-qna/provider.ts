import type { GetQnaRequest, GetQnaResult } from "./contract.ts";

export type GetQnaProvider = {
  readonly getQna: (request: GetQnaRequest) => Promise<GetQnaResult>;
};
