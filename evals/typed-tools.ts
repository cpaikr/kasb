import {
  createKasbAgentTools,
  defaultKasbAgentTools,
  defaultKasbAppOperations,
  executeKasbAgentTool,
  type KasbAgentTool,
  type KasbAgentToolName,
  type KasbAppOperations,
} from "../src/app/agent-tools.ts";

export type TypedEvalTool = KasbAgentTool;
export type KasbTypedEvalTool = KasbAgentTool;
export type KasbTypedEvalToolName = KasbAgentToolName;
export type { KasbAppOperations };
export { defaultKasbAppOperations };

export const createKasbTypedEvalTools = (
  operations: KasbAppOperations = defaultKasbAppOperations,
): readonly KasbTypedEvalTool[] => createKasbAgentTools(operations);

export const defaultKasbTypedEvalTools = defaultKasbAgentTools;

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
  return executeKasbAgentTool(tool.name, input, tools);
};
