import type { GetParagraphRequest, GetParagraphResult } from "./contract.ts";

export type GetParagraphProvider = {
  readonly getParagraph: (request: GetParagraphRequest) => Promise<GetParagraphResult>;
};
