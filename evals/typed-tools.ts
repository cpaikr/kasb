import type { JSONSchema } from "effect";

import { defaultGetParagraphOperation, type GetParagraphOperation } from "../src/app/get-paragraph.ts";
import { defaultGetQnaOperation, type GetQnaOperation } from "../src/app/get-qna.ts";
import { defaultGetSectionOperation, type GetSectionOperation } from "../src/app/get-section.ts";
import { defaultGetStandardStructureOperation, type GetStandardStructureOperation } from "../src/app/get-standard-structure.ts";
import { defaultSearchQnaOperation, type SearchQnaOperation } from "../src/app/search-qna.ts";
import { defaultSearchStandardsOperation, type SearchStandardsOperation } from "../src/app/search-standards.ts";

export type TypedEvalOperation<
  Name extends string,
  Input extends Record<string, unknown>,
  Result,
> = {
  readonly name: Name;
  readonly inputJsonSchema: JSONSchema.JsonSchema7Root;
  readonly resultJsonSchema: JSONSchema.JsonSchema7Root;
  readonly execute: (input: Partial<Input> & Record<string, unknown>) => Promise<Result>;
};

export type TypedEvalTool<
  Name extends string,
  Input extends Record<string, unknown>,
  Result,
> = {
  readonly name: Name;
  readonly description: string;
  readonly inputJsonSchema: JSONSchema.JsonSchema7Root;
  readonly resultJsonSchema: JSONSchema.JsonSchema7Root;
  readonly execute: (input: Partial<Input> & Record<string, unknown>) => Promise<Result>;
};

export type KasbAppOperations = {
  readonly searchStandards: SearchStandardsOperation;
  readonly getStandardStructure: GetStandardStructureOperation;
  readonly getSection: GetSectionOperation;
  readonly getParagraph: GetParagraphOperation;
  readonly searchQna: SearchQnaOperation;
  readonly getQna: GetQnaOperation;
};

export const defaultKasbAppOperations: KasbAppOperations = {
  searchStandards: defaultSearchStandardsOperation,
  getStandardStructure: defaultGetStandardStructureOperation,
  getSection: defaultGetSectionOperation,
  getParagraph: defaultGetParagraphOperation,
  searchQna: defaultSearchQnaOperation,
  getQna: defaultGetQnaOperation,
};

const typedEvalTool = <
  const Name extends string,
  Input extends Record<string, unknown>,
  Result,
>(
  operation: TypedEvalOperation<Name, Input, Result>,
  description: string,
): TypedEvalTool<Name, Input, Result> => ({
  name: operation.name,
  description,
  inputJsonSchema: operation.inputJsonSchema,
  resultJsonSchema: operation.resultJsonSchema,
  execute: operation.execute,
});

export const createKasbTypedEvalTools = (operations: KasbAppOperations = defaultKasbAppOperations) => [
  typedEvalTool(
    operations.searchStandards,
    "Search KASB standards by semantic typed parameters, without CLI argv parsing.",
  ),
  typedEvalTool(
    operations.getStandardStructure,
    "Retrieve a standard's structure and section identifiers by typed parameters.",
  ),
  typedEvalTool(
    operations.getSection,
    "Retrieve one standard section by indexDocumentId or ref using typed parameters.",
  ),
  typedEvalTool(
    operations.getParagraph,
    "Retrieve one exact paragraph by stdNum and paraNum using typed parameters.",
  ),
  typedEvalTool(
    operations.searchQna,
    "Search KASB Q&A documents by semantic typed parameters, without CLI argv parsing.",
  ),
  typedEvalTool(
    operations.getQna,
    "Retrieve one KASB Q&A document by docNumber using typed parameters.",
  ),
] as const;

export type KasbTypedEvalTool = ReturnType<typeof createKasbTypedEvalTools>[number];
export type KasbTypedEvalToolName = KasbTypedEvalTool["name"];

export const defaultKasbTypedEvalTools = createKasbTypedEvalTools();

export const findKasbTypedEvalTool = (
  tools: readonly KasbTypedEvalTool[],
  name: string,
): KasbTypedEvalTool | undefined => tools.find((tool) => tool.name === name);

export const executeKasbTypedEvalTool = async (
  tools: readonly KasbTypedEvalTool[],
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> => {
  const tool = findKasbTypedEvalTool(tools, name);
  if (tool === undefined) {
    throw new Error(`Unknown KASB typed eval tool: ${name}`);
  }
  return tool.execute(input);
};
