import type { KasbExecutionContext } from "../types.ts";
import type { GetParagraphRequest, GetParagraphResult } from "./contract.ts";

export type GetParagraphProvider = {
  readonly getParagraph: (
    request: GetParagraphRequest,
    context?: KasbExecutionContext,
  ) => Promise<GetParagraphResult>;
};
