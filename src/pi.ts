import {
  createKasbSingleToolActionFailure,
  createKasbSingleToolCommandFailure,
  createKasbSingleToolInputJsonFailure,
  createKasbToolset,
  createKasbUnknownOperationError,
  formatKasbCommandHelp,
  formatKasbInvalidToolInput,
  formatKasbRunFailure,
  formatKasbRunSuccess,
  formatKasbToolsetHelp,
  formatKasbUnknownCommand,
  formatKasbValidationFailure,
  formatKasbValidationSuccess,
  kasbOperationNames,
  kasbSingleToolActions,
  kasbSingleToolCopy,
  serializeKasbError,
  type KasbCommandHelp,
  type KasbSerializedError,
  type KasbSingleToolAction,
  type KasbSingleToolRunAction,
  type KasbToolset,
  type KasbToolsetHelp,
  type KasbValidationFailure,
  type KasbValidationResult,
} from "./toolset.ts";

export type KasbPiToolAction = KasbSingleToolAction;

export type KasbPiToolInput = {
  action: KasbPiToolAction;
  command?: string;
  inputJson?: Record<string, unknown>;
};

export type PiToolContent = {
  type: "text";
  text: string;
};

export type PiToolResult = {
  content: PiToolContent[];
  details: unknown;
};

export type KasbPiToolDefinition = {
  name: "kasb";
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
  parameters: typeof kasbPiToolParameters;
  execute: (
    toolCallId: string,
    params: KasbPiToolInput,
    signal?: AbortSignal,
    onUpdate?: unknown,
    ctx?: unknown,
  ) => Promise<PiToolResult>;
};

export type KasbPiExtensionAPI = {
  registerTool: (tool: KasbPiToolDefinition) => void;
};

type KasbPiToolset = Pick<
  KasbToolset,
  | "id"
  | "label"
  | "description"
  | "help"
  | "listOperations"
  | "getCommandHelp"
  | "validateInput"
  | "execute"
> & {
  serializeError?: typeof serializeKasbError;
};

type KasbPiActionResult =
  | { ok: true; action: "help"; help: KasbToolsetHelp }
  | { ok: true; action: "command_help"; command: string; commandHelp: KasbCommandHelp }
  | {
      ok: true;
      action: "validate";
      command: string;
      validation: Extract<KasbValidationResult, { ok: true }>;
    }
  | {
      ok: true;
      action: "run";
      command: string;
      normalizedInput: Record<string, unknown>;
      result: unknown;
    }
  | {
      ok: false;
      action: KasbPiToolAction | "adapter_validation";
      command?: string;
      error: KasbValidationFailure | KasbSerializedError;
    };

const actionSchema = {
  type: "string",
  enum: [...kasbSingleToolActions],
  description: kasbSingleToolCopy.parameterDescriptions.action,
};

const commandSchema = {
  type: "string",
  enum: [...kasbOperationNames],
  description: kasbSingleToolCopy.parameterDescriptions.command,
};

export const kasbPiToolParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: actionSchema,
    command: commandSchema,
    inputJson: {
      type: "object",
      additionalProperties: true,
      description: kasbSingleToolCopy.parameterDescriptions.inputJson,
    },
  },
  required: ["action"],
};

export type CreateKasbPiToolOptions = {
  readonly toolset?: KasbPiToolset;
};

const toTextResult = (text: string, details: KasbPiActionResult): PiToolResult => ({
  content: [{ type: "text", text }],
  details,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPiToolResult = (value: unknown): value is PiToolResult =>
  isRecord(value) && Array.isArray(value.content) && "details" in value;

const isKasbPiAction = (value: unknown): value is KasbPiToolAction =>
  typeof value === "string" && kasbSingleToolActions.includes(value as KasbPiToolAction);

const adapterFailureResult = (
  action: KasbPiToolAction | "adapter_validation",
  error: KasbValidationFailure,
  command?: string,
): PiToolResult =>
  toTextResult(formatKasbInvalidToolInput(error), {
    ok: false,
    action,
    ...(command === undefined ? {} : { command }),
    error,
  });

const requireCommand = (action: KasbPiToolAction, command: unknown): string | PiToolResult => {
  if (typeof command === "string" && command.length > 0) return command;
  return adapterFailureResult(action, createKasbSingleToolCommandFailure(action, command));
};

const requireInputJson = (
  action: KasbSingleToolRunAction,
  command: string,
  inputJson: unknown,
): Record<string, unknown> | PiToolResult => {
  if (isRecord(inputJson)) return inputJson;
  return adapterFailureResult(
    action,
    createKasbSingleToolInputJsonFailure(action, command, inputJson),
    command,
  );
};

const unknownCommandResult = (action: "command_help", command: string): PiToolResult => {
  const error = serializeKasbError(createKasbUnknownOperationError(command));
  return toTextResult(formatKasbUnknownCommand(command, error), {
    ok: false,
    action,
    command,
    error,
  });
};

const handleHelp = (toolset: KasbPiToolset): PiToolResult => {
  const help = toolset.help();
  return toTextResult(formatKasbToolsetHelp(help), { ok: true, action: "help", help });
};

const handleCommandHelp = (toolset: KasbPiToolset, command: string): PiToolResult => {
  const commandHelp = toolset.getCommandHelp(command);
  if (commandHelp === undefined) return unknownCommandResult("command_help", command);

  return toTextResult(formatKasbCommandHelp(commandHelp), {
    ok: true,
    action: "command_help",
    command,
    commandHelp,
  });
};

const handleValidate = (
  toolset: KasbPiToolset,
  command: string,
  inputJson: Record<string, unknown>,
): PiToolResult => {
  const validation = toolset.validateInput(command, inputJson);
  if (!validation.ok) {
    return toTextResult(formatKasbValidationFailure("validate", command, validation.error), {
      ok: false,
      action: "validate",
      command,
      error: validation.error,
    });
  }

  return toTextResult(formatKasbValidationSuccess(command, validation), {
    ok: true,
    action: "validate",
    command,
    validation,
  });
};

const handleRun = async (
  toolset: KasbPiToolset,
  command: string,
  inputJson: Record<string, unknown>,
  signal: AbortSignal | undefined,
): Promise<PiToolResult> => {
  const validation = toolset.validateInput(command, inputJson);
  if (!validation.ok) {
    return toTextResult(formatKasbValidationFailure("run", command, validation.error), {
      ok: false,
      action: "run",
      command,
      error: validation.error,
    });
  }

  try {
    const result = await toolset.execute(
      command,
      validation.input,
      signal === undefined ? undefined : { signal },
    );

    return toTextResult(formatKasbRunSuccess(command, result), {
      ok: true,
      action: "run",
      command,
      normalizedInput: validation.input,
      result,
    });
  } catch (error) {
    const serialized = toolset.serializeError?.(error) ?? serializeKasbError(error);
    return toTextResult(formatKasbRunFailure(command, serialized), {
      ok: false,
      action: "run",
      command,
      error: serialized,
    });
  }
};

export const createKasbPiTool = (options: CreateKasbPiToolOptions = {}): KasbPiToolDefinition => {
  const toolset = options.toolset ?? createKasbToolset();

  return {
    name: "kasb",
    label: toolset.label,
    description: kasbSingleToolCopy.description,
    promptSnippet: kasbSingleToolCopy.promptSnippet,
    promptGuidelines: [...kasbSingleToolCopy.promptGuidelines],
    parameters: kasbPiToolParameters,
    async execute(_toolCallId, params, signal) {
      if (!isRecord(params) || !isKasbPiAction(params.action)) {
        return adapterFailureResult(
          "adapter_validation",
          createKasbSingleToolActionFailure(params),
        );
      }

      switch (params.action) {
        case "help":
          return handleHelp(toolset);
        case "command_help": {
          const command = requireCommand(params.action, params.command);
          return typeof command === "string" ? handleCommandHelp(toolset, command) : command;
        }
        case "validate": {
          const command = requireCommand(params.action, params.command);
          if (typeof command !== "string") return command;

          const inputJson = requireInputJson(params.action, command, params.inputJson);
          return isPiToolResult(inputJson) ? inputJson : handleValidate(toolset, command, inputJson);
        }
        case "run": {
          const command = requireCommand(params.action, params.command);
          if (typeof command !== "string") return command;

          const inputJson = requireInputJson(params.action, command, params.inputJson);
          return isPiToolResult(inputJson) ? inputJson : handleRun(toolset, command, inputJson, signal);
        }
      }
    },
  };
};

export const registerKasbPiTool = (
  pi: KasbPiExtensionAPI,
  options: CreateKasbPiToolOptions = {},
): void => {
  pi.registerTool(createKasbPiTool(options));
};

export default function kasbPiExtension(pi: KasbPiExtensionAPI): void {
  registerKasbPiTool(pi);
}
