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
      "Search KASB standards with typed JSON fields keyword and optional limit; use keyword, not query, CLI flags, or source searchWord.",
    operation: operations.searchStandards,
  }),
  createKasbAgentTool({
    name: "kasb_get_standard_structure",
    description:
      "Retrieve a KASB standard's structure with typed JSON field stdNum and optional keyword; use returned indexDocumentId values for kasb_get_section.",
    operation: operations.getStandardStructure,
  }),
  createKasbAgentTool({
    name: "kasb_get_section",
    description:
      "Retrieve one KASB standard section with typed JSON field stdNum and exactly one of indexDocumentId or ref; do not use browser titleDocumentId values.",
    operation: operations.getSection,
  }),
  createKasbAgentTool({
    name: "kasb_get_paragraph",
    description:
      "Retrieve one exact KASB standard paragraph with typed JSON fields stdNum and paraNum; use kasb_get_section with ref for paragraph ranges.",
    operation: operations.getParagraph,
  }),
  createKasbAgentTool({
    name: "kasb_search_qna",
    description:
      "Search KASB Q&A documents with typed JSON fields keyword, page, rows, and optional numeric types CSV; use keyword, not query, and use rows rather than CLI --limit here.",
    operation: operations.searchQna,
  }),
  createKasbAgentTool({
    name: "kasb_get_qna",
    description:
      "Retrieve one KASB Q&A document with typed JSON field docNumber and optional keyword; docNumber comes from kasb_search_qna.",
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
