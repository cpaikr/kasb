import type { GetParagraphRawInput, GetParagraphResult } from "../capabilities/get-paragraph/contract.ts";
import { executeGetParagraph } from "../capabilities/get-paragraph/execute.ts";
import type { GetParagraphProvider } from "../capabilities/get-paragraph/provider.ts";
import type { KasbExecutionContext } from "../capabilities/types.ts";
import { getParagraphInputJsonSchema, getParagraphOperationName, getParagraphResultJsonSchema } from "../capabilities/get-paragraph/spec.ts";
import { kasbParagraphProvider } from "../sources/kasb/provider.ts";

export type GetParagraphOperation = {
  readonly name: typeof getParagraphOperationName;
  readonly inputJsonSchema: typeof getParagraphInputJsonSchema;
  readonly resultJsonSchema: typeof getParagraphResultJsonSchema;
  readonly execute: (
    input: Partial<GetParagraphRawInput> & Record<string, unknown>,
    context?: KasbExecutionContext,
  ) => Promise<GetParagraphResult>;
};

export const createGetParagraphOperation = (provider: GetParagraphProvider): GetParagraphOperation => ({
  name: getParagraphOperationName,
  inputJsonSchema: getParagraphInputJsonSchema,
  resultJsonSchema: getParagraphResultJsonSchema,
  execute: (input, context) => executeGetParagraph(input, provider, context),
});

export const defaultGetParagraphOperation = createGetParagraphOperation(kasbParagraphProvider);
