import type { GetQnaRawInput, GetQnaResult } from "../capabilities/get-qna/contract.ts";
import { executeGetQna } from "../capabilities/get-qna/execute.ts";
import type { GetQnaProvider } from "../capabilities/get-qna/provider.ts";
import { getQnaInputJsonSchema, getQnaOperationName, getQnaResultJsonSchema } from "../capabilities/get-qna/spec.ts";
import { kasbQnaProvider } from "../sources/kasb/provider.ts";

export type GetQnaOperation = {
  readonly name: typeof getQnaOperationName;
  readonly inputJsonSchema: typeof getQnaInputJsonSchema;
  readonly resultJsonSchema: typeof getQnaResultJsonSchema;
  readonly execute: (input: Partial<GetQnaRawInput> & Record<string, unknown>) => Promise<GetQnaResult>;
};

export const createGetQnaOperation = (provider: GetQnaProvider): GetQnaOperation => ({
  name: getQnaOperationName,
  inputJsonSchema: getQnaInputJsonSchema,
  resultJsonSchema: getQnaResultJsonSchema,
  execute: (input) => executeGetQna(input, provider),
});

export const defaultGetQnaOperation = createGetQnaOperation(kasbQnaProvider);
