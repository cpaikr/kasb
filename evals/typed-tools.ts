import {
  defaultGetParagraphOperation,
  defaultGetQnaOperation,
  defaultGetSectionOperation,
  defaultGetStandardStructureOperation,
  defaultSearchQnaOperation,
  defaultSearchStandardsOperation,
} from "../packages/node/src/default-operations.ts";

export const kasbTypedEvalToolNames = [
  "kasb_search_standards",
  "kasb_get_standard_structure",
  "kasb_get_section",
  "kasb_get_paragraph",
  "kasb_search_qna",
  "kasb_get_qna",
] as const;

export type KasbTypedEvalToolName = (typeof kasbTypedEvalToolNames)[number];

export type KasbAppOperation = {
  readonly name: string;
  readonly inputJsonSchema: unknown;
  readonly resultJsonSchema: unknown;
  readonly execute: (input: Record<string, unknown>) => Promise<unknown>;
};

export type KasbAppOperations = {
  readonly searchStandards: KasbAppOperation;
  readonly getStandardStructure: KasbAppOperation;
  readonly getSection: KasbAppOperation;
  readonly getParagraph: KasbAppOperation;
  readonly searchQna: KasbAppOperation;
  readonly getQna: KasbAppOperation;
};

export type KasbTypedEvalTool = {
  readonly name: KasbTypedEvalToolName;
  readonly operationName: string;
  readonly description: string;
  readonly definition: {
    readonly type: "function";
    readonly function: {
      readonly name: KasbTypedEvalToolName;
      readonly description: string;
      readonly parameters: unknown;
    };
  };
  readonly inputJsonSchema: unknown;
  readonly resultJsonSchema: unknown;
  readonly execute: (input: Record<string, unknown>) => Promise<unknown>;
};

export const defaultKasbAppOperations: KasbAppOperations = {
  searchStandards: defaultSearchStandardsOperation,
  getStandardStructure: defaultGetStandardStructureOperation,
  getSection: defaultGetSectionOperation,
  getParagraph: defaultGetParagraphOperation,
  searchQna: defaultSearchQnaOperation,
  getQna: defaultGetQnaOperation,
};

const createTool = (input: {
  readonly name: KasbTypedEvalToolName;
  readonly description: string;
  readonly operation: KasbAppOperation;
}): KasbTypedEvalTool => ({
  name: input.name,
  operationName: input.operation.name,
  description: input.description,
  definition: {
    type: "function",
    function: {
      name: input.name,
      description: input.description,
      parameters: input.operation.inputJsonSchema,
    },
  },
  inputJsonSchema: input.operation.inputJsonSchema,
  resultJsonSchema: input.operation.resultJsonSchema,
  execute: input.operation.execute,
});

export const createKasbTypedEvalTools = (
  operations: KasbAppOperations = defaultKasbAppOperations,
): readonly KasbTypedEvalTool[] => [
  createTool({
    name: "kasb_search_standards",
    description: "Search KASB standards. Typed JSON fields are keyword plus optional limit/sort; use keyword, not query, CLI flags, or source searchWord.",
    operation: operations.searchStandards,
  }),
  createTool({
    name: "kasb_get_standard_structure",
    description: "Retrieve a KASB standard structure. Typed JSON fields are stdNum plus optional keyword; pass the returned indexDocumentId to kasb_get_section.",
    operation: operations.getStandardStructure,
  }),
  createTool({
    name: "kasb_get_section",
    description: "Retrieve one KASB standard section. Typed JSON fields are stdNum and exactly one of indexDocumentId/ref; do not use browser titleDocumentId.",
    operation: operations.getSection,
  }),
  createTool({
    name: "kasb_get_paragraph",
    description: "Retrieve one exact KASB standard paragraph. Typed JSON fields are stdNum and paraNum; retrieve paragraph ranges with kasb_get_section ref.",
    operation: operations.getParagraph,
  }),
  createTool({
    name: "kasb_search_qna",
    description: "Search KASB Q&A documents. Typed JSON fields are keyword, page, rows, optional numeric types CSV, and sortDate/from/to; use keyword instead of query and rows instead of CLI --limit.",
    operation: operations.searchQna,
  }),
  createTool({
    name: "kasb_get_qna",
    description: "Retrieve one KASB Q&A document. Typed JSON fields are docNumber plus optional keyword; get docNumber from kasb_search_qna results.",
    operation: operations.getQna,
  }),
];

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
  if (tool === undefined) throw new Error(`Unknown KASB typed eval tool: ${name}`);
  return tool.execute(input);
};
