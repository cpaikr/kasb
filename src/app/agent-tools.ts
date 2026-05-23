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
      "KASB 기준서를 검색합니다. typed JSON field는 keyword와 선택 limit/sort이며, query, CLI flag, 원천 searchWord가 아니라 keyword를 사용하세요.",
    operation: operations.searchStandards,
  }),
  createKasbAgentTool({
    name: "kasb_get_standard_structure",
    description:
      "KASB 기준서 구조를 조회합니다. typed JSON field는 stdNum과 선택 keyword이며, 반환된 indexDocumentId를 kasb_get_section에 전달하세요.",
    operation: operations.getStandardStructure,
  }),
  createKasbAgentTool({
    name: "kasb_get_section",
    description:
      "KASB 기준서 섹션 하나를 조회합니다. typed JSON field는 stdNum과 indexDocumentId/ref 중 정확히 하나이며, 브라우저 titleDocumentId는 사용하지 마세요.",
    operation: operations.getSection,
  }),
  createKasbAgentTool({
    name: "kasb_get_paragraph",
    description:
      "KASB 기준서 문단 하나를 정확히 조회합니다. typed JSON field는 stdNum과 paraNum이며, 문단 범위는 kasb_get_section의 ref로 조회하세요.",
    operation: operations.getParagraph,
  }),
  createKasbAgentTool({
    name: "kasb_search_qna",
    description:
      "KASB Q&A 문서를 검색합니다. typed JSON field는 keyword, page, rows, 선택 numeric types CSV, sortDate/from/to이며, query가 아니라 keyword를 쓰고 CLI --limit 대신 rows를 사용하세요.",
    operation: operations.searchQna,
  }),
  createKasbAgentTool({
    name: "kasb_get_qna",
    description:
      "KASB Q&A 문서 하나를 조회합니다. typed JSON field는 docNumber와 선택 keyword이며, docNumber는 kasb_search_qna 결과에서 가져오세요.",
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
