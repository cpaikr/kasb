import { defaultGetParagraphOperation } from "./get-paragraph.ts";
import { defaultGetQnaOperation } from "./get-qna.ts";
import { defaultGetSectionOperation } from "./get-section.ts";
import { defaultGetStandardStructureOperation } from "./get-standard-structure.ts";
import { defaultSearchQnaOperation } from "./search-qna.ts";
import { defaultSearchStandardsOperation } from "./search-standards.ts";

export const kasbAgentToolNames = [
  "kasb_search_standards",
  "kasb_get_standard_structure",
  "kasb_get_section",
  "kasb_get_paragraph",
  "kasb_search_qna",
  "kasb_get_qna",
] as const;

export type KasbAgentToolName = (typeof kasbAgentToolNames)[number];

export type KasbAgentToolDefinition = {
  readonly type: "function";
  readonly function: {
    readonly name: KasbAgentToolName;
    readonly description: string;
    readonly parameters: unknown;
  };
};

export type KasbAgentTool = {
  readonly name: KasbAgentToolName;
  readonly operationName: string;
  readonly description: string;
  readonly definition: KasbAgentToolDefinition;
  readonly inputJsonSchema: unknown;
  readonly resultJsonSchema: unknown;
  readonly execute: (input: Record<string, unknown>) => Promise<unknown>;
};

type AppOperation = {
  readonly name: string;
  readonly inputJsonSchema: unknown;
  readonly resultJsonSchema: unknown;
  readonly execute: (input: Record<string, unknown>) => Promise<unknown>;
};

export type KasbAppOperations = {
  readonly searchStandards: AppOperation;
  readonly getStandardStructure: AppOperation;
  readonly getSection: AppOperation;
  readonly getParagraph: AppOperation;
  readonly searchQna: AppOperation;
  readonly getQna: AppOperation;
};

export const defaultKasbAppOperations: KasbAppOperations = {
  searchStandards: defaultSearchStandardsOperation,
  getStandardStructure: defaultGetStandardStructureOperation,
  getSection: defaultGetSectionOperation,
  getParagraph: defaultGetParagraphOperation,
  searchQna: defaultSearchQnaOperation,
  getQna: defaultGetQnaOperation,
};

const createKasbAgentTool = (input: {
  readonly name: KasbAgentToolName;
  readonly description: string;
  readonly operation: AppOperation;
}): KasbAgentTool => ({
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

export const createKasbAgentTools = (
  operations: KasbAppOperations = defaultKasbAppOperations,
): readonly KasbAgentTool[] => [
  createKasbAgentTool({
    name: "kasb_search_standards",
    description:
      "Search KASB standards. Typed JSON fields are keyword plus optional limit/sort; use keyword, not query, CLI flags, or source searchWord.",
    operation: operations.searchStandards,
  }),
  createKasbAgentTool({
    name: "kasb_get_standard_structure",
    description:
      "Retrieve a KASB standard structure. Typed JSON fields are stdNum plus optional keyword; pass the returned indexDocumentId to kasb_get_section.",
    operation: operations.getStandardStructure,
  }),
  createKasbAgentTool({
    name: "kasb_get_section",
    description:
      "Retrieve one KASB standard section. Typed JSON fields are stdNum and exactly one of indexDocumentId/ref; do not use browser titleDocumentId.",
    operation: operations.getSection,
  }),
  createKasbAgentTool({
    name: "kasb_get_paragraph",
    description:
      "Retrieve one exact KASB standard paragraph. Typed JSON fields are stdNum and paraNum; retrieve paragraph ranges with kasb_get_section ref.",
    operation: operations.getParagraph,
  }),
  createKasbAgentTool({
    name: "kasb_search_qna",
    description:
      "Search KASB Q&A documents. Typed JSON fields are keyword, page, rows, optional numeric types CSV, and sortDate/from/to; use keyword instead of query and rows instead of CLI --limit.",
    operation: operations.searchQna,
  }),
  createKasbAgentTool({
    name: "kasb_get_qna",
    description:
      "Retrieve one KASB Q&A document. Typed JSON fields are docNumber plus optional keyword; get docNumber from kasb_search_qna results.",
    operation: operations.getQna,
  }),
];

export const defaultKasbAgentTools = createKasbAgentTools();

export const kasbAgentToolDefinitions = defaultKasbAgentTools.map(
  (tool) => tool.definition,
);

export const isKasbAgentToolName = (value: unknown): value is KasbAgentToolName =>
  typeof value === "string" &&
  kasbAgentToolNames.includes(value as KasbAgentToolName);

export const getKasbAgentTool = (
  name: KasbAgentToolName,
  tools: readonly KasbAgentTool[] = defaultKasbAgentTools,
): KasbAgentTool => {
  const tool = tools.find((candidate) => candidate.name === name);

  if (tool === undefined) {
    throw new Error(`Unknown KASB agent tool: ${name}`);
  }

  return tool;
};

export const executeKasbAgentTool = async (
  name: KasbAgentToolName,
  input: Record<string, unknown>,
  tools: readonly KasbAgentTool[] = defaultKasbAgentTools,
): Promise<unknown> => getKasbAgentTool(name, tools).execute(input);
