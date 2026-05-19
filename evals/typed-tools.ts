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
    "Search KASB standards with typed JSON fields keyword and optional limit; use keyword, not query, CLI flags, or source searchWord.",
  ),
  typedEvalTool(
    operations.getStandardStructure,
    "Retrieve a standard's structure with typed JSON field stdNum and optional keyword; use returned indexDocumentId values for get-section.",
  ),
  typedEvalTool(
    operations.getSection,
    "Retrieve one standard section with typed JSON field stdNum and exactly one of indexDocumentId or ref; do not use browser titleDocumentId values.",
  ),
  typedEvalTool(
    operations.getParagraph,
    "Retrieve one exact paragraph with typed JSON fields stdNum and paraNum; use get-section with ref for paragraph ranges.",
  ),
  typedEvalTool(
    operations.searchQna,
    "Search KASB Q&A documents with typed JSON fields keyword, page, rows, and optional numeric types CSV; use keyword, not query, and use rows rather than CLI --limit here.",
  ),
  typedEvalTool(
    operations.getQna,
    "Retrieve one KASB Q&A document with typed JSON field docNumber and optional keyword; docNumber comes from search-qna.",
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
