import { defaultGetParagraphOperation } from "./app/get-paragraph.ts";
import { defaultGetQnaOperation } from "./app/get-qna.ts";
import { defaultGetSectionOperation } from "./app/get-section.ts";
import { defaultGetStandardStructureOperation } from "./app/get-standard-structure.ts";
import { defaultSearchQnaOperation } from "./app/search-qna.ts";
import { defaultSearchStandardsOperation } from "./app/search-standards.ts";
import { resolveGetParagraphRequest } from "./capabilities/get-paragraph/contract.ts";
import { resolveGetQnaRequest } from "./capabilities/get-qna/contract.ts";
import { resolveGetSectionRequest } from "./capabilities/get-section/contract.ts";
import { resolveGetStandardStructureRequest } from "./capabilities/get-standard-structure/contract.ts";
import { resolveSearchQnaRequest } from "./capabilities/search-qna/contract.ts";
import { resolveSearchStandardsRequest } from "./capabilities/search-standards/contract.ts";

export const kasbOperationNames = [
  "search-standards",
  "get-standard-structure",
  "get-section",
  "get-paragraph",
  "search-qna",
  "get-qna",
] as const;

export type KasbOperationName = (typeof kasbOperationNames)[number];

export const kasbSingleToolActions = [
  "help",
  "command_help",
  "validate",
  "run",
] as const;

export type KasbSingleToolAction = (typeof kasbSingleToolActions)[number];
export type KasbSingleToolRunAction = Extract<KasbSingleToolAction, "validate" | "run">;

export type KasbToolRunContext = {
  readonly signal?: AbortSignal;
};

export type KasbOperationSummary = {
  readonly name: KasbOperationName;
  readonly label: string;
  readonly description: string;
};

export type KasbOperationSpec = KasbOperationSummary & {
  readonly inputJsonSchema: unknown;
  readonly resultJsonSchema: unknown;
  readonly requiredInputKeys: readonly string[];
  readonly examples: readonly Record<string, unknown>[];
  readonly limitations: readonly string[];
  readonly resultSummary: string;
};

export type KasbCommandHelp = KasbOperationSpec;

export type KasbToolsetHelp = {
  readonly id: "kasb";
  readonly label: string;
  readonly description: string;
  readonly usage: string;
  readonly operations: readonly KasbOperationSummary[];
  readonly limitations: readonly string[];
  readonly citationGuidance: readonly string[];
};

export type KasbValidationFailureCode =
  | "missing_parameter"
  | "invalid_parameter"
  | "unknown_parameter"
  | "invalid_request";

export type KasbValidationRecoveryAction =
  | { readonly kind: "inspect_tool_help" }
  | { readonly kind: "inspect_command_help"; readonly operationName: KasbOperationName };

export type KasbValidationFailure = {
  readonly code: KasbValidationFailureCode;
  readonly message: string;
  readonly operationName?: string;
  readonly parameter?: string;
  readonly reason?: string;
  readonly expected?: string;
  readonly actual?: unknown;
  readonly recoveryHint?: string;
  readonly exampleInput?: Record<string, unknown>;
  readonly retryable: boolean;
  readonly recoveryAction?: KasbValidationRecoveryAction;
};

export type KasbValidationResult =
  | { readonly ok: true; readonly input: Record<string, unknown> }
  | { readonly ok: false; readonly error: KasbValidationFailure };

export type KasbSerializedError = {
  readonly name: string;
  readonly message: string;
  readonly code?: string;
  readonly retryable?: boolean;
  readonly parameter?: string;
  readonly sourceUrl?: string;
  readonly recoveryHint?: string;
  readonly operationName?: string;
};

export type KasbToolset = {
  readonly id: "kasb";
  readonly label: string;
  readonly description: string;
  readonly help: () => KasbToolsetHelp;
  readonly listOperations: () => readonly KasbOperationSummary[];
  readonly getOperation: (name: string) => KasbOperationSpec | undefined;
  readonly getCommandHelp: (name: string) => KasbOperationSpec | undefined;
  readonly validateInput: (name: string, input: unknown) => KasbValidationResult;
  readonly execute: (
    name: string,
    input: Record<string, unknown>,
    context?: KasbToolRunContext,
  ) => Promise<unknown>;
  readonly serializeError: (error: unknown) => KasbSerializedError;
};

export type KasbSingleToolCopy = {
  readonly description: string;
  readonly promptSnippet: string;
  readonly promptGuidelines: readonly string[];
  readonly parameterDescriptions: {
    readonly action: string;
    readonly command: string;
    readonly inputJson: string;
  };
  readonly actionSummaries: Record<KasbSingleToolAction, string>;
};

export type KasbToolsetErrorCode = "unknown_operation" | "aborted";

export class KasbToolsetError extends Error {
  override readonly name = "KasbToolsetError";
  readonly code: KasbToolsetErrorCode;
  readonly retryable: boolean;
  readonly operationName: string | undefined;

  constructor(input: {
    readonly code: KasbToolsetErrorCode;
    readonly message: string;
    readonly retryable: boolean;
    readonly operationName?: string;
  }) {
    super(input.message);
    this.code = input.code;
    this.retryable = input.retryable;
    this.operationName = input.operationName;
  }
}

export const createKasbUnknownOperationError = (operationName: string): KasbToolsetError =>
  new KasbToolsetError({
    code: "unknown_operation",
    message: `Unknown KASB operation: ${operationName}`,
    retryable: false,
    operationName,
  });

type AppOperation = {
  readonly name: KasbOperationName;
  readonly inputJsonSchema: unknown;
  readonly resultJsonSchema: unknown;
  readonly execute: (input: Record<string, unknown>) => Promise<unknown>;
};

export type KasbOperationDefinition = KasbOperationSummary & {
  readonly operation: AppOperation;
  readonly examples: readonly Record<string, unknown>[];
  readonly limitations: readonly string[];
  readonly resultSummary: string;
  readonly prepareInput: (input: unknown) => Record<string, unknown>;
};

export type CreateKasbToolsetOptions = {
  /** Override operations for tests or custom hosts. Default uses the KASB-backed operations. */
  readonly operations?: readonly KasbOperationDefinition[];
};

const sourceLimitations = [
  "Kasb reads the observed public db.kasb.or.kr JSON API in read-only mode; source behavior can change.",
  "Returned content is structured source material, not accounting, legal, investment, or tax advice.",
  "Browser route titleDocumentId values are not public section inputs; use get-standard-structure to obtain indexDocumentId values.",
  "Q&A date filtering and ordering are applied client-side where the observed source endpoint ignores date controls.",
] as const;

const citationGuidance = [
  "Use result.references, metadata, warnings, stdNum/indexDocumentId/paraNum/docNumber, and returned source API URLs when citing findings.",
  "For standards research, search first, inspect a standard structure, then fetch sections or exact paragraphs before drawing conclusions.",
  "For Q&A research, search-qna returns docNumber values that should be passed to get-qna for full document context.",
] as const;

export const kasbSingleToolCopy = {
  description:
    "One read-only KASB standards and Q&A source tool. Use help or command_help to inspect commands, validate to normalize input, and run to execute with references, warnings, and metadata.",
  promptSnippet:
    "Use kasb(action, command?, inputJson?) for Korean KASB standard search, structure lookup, section/paragraph retrieval, and KASB Q&A retrieval.",
  promptGuidelines: [
    "Use kasb with action=help to discover available KASB commands before guessing command names.",
    "Use kasb with action=command_help when required keys, allowed values, examples, limitations, or result shape are unclear.",
    "Use kasb with action=validate to repair or normalize command input without live KASB access.",
    "Use kasb with action=run only after forming command input; Kasb validates before execution and returns source references, warnings, and metadata for citations.",
    "Use stdNum, indexDocumentId, paraNum, and docNumber fields directly; do not pass CLI flags, raw searchWord, or browser titleDocumentId fields as inputJson keys.",
  ],
  parameterDescriptions: {
    action: "Kasb tool action: help, command_help, validate, or run.",
    command: "Canonical KASB operation name, such as search-standards or get-paragraph.",
    inputJson: "Command input object using the selected KASB operation's JSON input contract.",
  },
  actionSummaries: {
    help: "source-level help and command menu.",
    command_help: "one command's schema, examples, limitations, and result summary.",
    validate: "validate and normalize one command input without live KASB access.",
    run: "validate, then execute one command.",
  },
} as const satisfies KasbSingleToolCopy;

const defaultOperationDefinitions = [
  {
    name: "search-standards",
    label: "Search standards",
    description: "Find KASB standards relevant to a keyword before deeper retrieval.",
    operation: defaultSearchStandardsOperation,
    prepareInput: (input) => resolveSearchStandardsRequest(input as Record<string, unknown>),
    examples: [{ keyword: "리스", limit: 10 }, { keyword: "수익인식", sort: "match-count" }],
    limitations: [
      "Search uses the observed /api/standard endpoint and may reflect source ranking or metadata drift.",
      "Use returned stdNum values with get-standard-structure before fetching sections.",
    ],
    resultSummary: "Returns matching standards, source match counts, suggested keywords, references, warnings, and nextActions for structure lookup.",
  },
  {
    name: "get-standard-structure",
    label: "Get standard structure",
    description: "Return the section tree for one standard and expose retrieval-facing indexDocumentId values.",
    operation: defaultGetStandardStructureOperation,
    prepareInput: (input) => resolveGetStandardStructureRequest(input as Record<string, unknown>),
    examples: [{ stdNum: "1116" }, { stdNum: "1116", keyword: "리스" }],
    limitations: [
      "Uses standard-indexes, not browser title ids; titleDocumentId is not accepted by get-section.",
      "Keyword-filtered structures may include broad or noisy source matches.",
    ],
    resultSummary: "Returns normalized section nodes with indexDocumentId, title, ref, level, documentType, parent ids, source metadata, and warnings.",
  },
  {
    name: "get-section",
    label: "Get section",
    description: "Fetch one standard section by indexDocumentId or by a ref resolved through the structure index.",
    operation: defaultGetSectionOperation,
    prepareInput: (input) => resolveGetSectionRequest(input as Record<string, unknown>),
    examples: [{ stdNum: "1116", indexDocumentId: "ZB2hJW" }, { stdNum: "1116", ref: "9~17" }],
    limitations: [
      "Requires exactly one section locator: indexDocumentId or ref.",
      "Ref lookup resolves through the current source structure and may warn when the ref is ambiguous.",
      "Preserved source HTML fields are reported in metadata content notes rather than interpreted by the tool.",
    ],
    resultSummary: "Returns resolved section metadata and ordered title/paragraph clauses with citations, metadata, and warnings.",
  },
  {
    name: "get-paragraph",
    label: "Get paragraph",
    description: "Fetch one exact KASB paragraph by stable stdNum + paraNum reference.",
    operation: defaultGetParagraphOperation,
    prepareInput: (input) => resolveGetParagraphRequest(input as Record<string, unknown>),
    examples: [{ stdNum: "1116", paraNum: "23" }, { stdNum: "1116", paraNum: "B3" }],
    limitations: [
      "paraNum must be one exact paragraph, not a paragraph range; use get-section with ref for ranges.",
      "Parent section metadata is best-effort when the structure index can be checked.",
    ],
    resultSummary: "Returns one paragraph with uniqueKey, source HTML/plain text, parent indexDocumentId, references, metadata, and warnings.",
  },
  {
    name: "search-qna",
    label: "Search Q&A",
    description: "Search KASB Q&A documents by keyword and optional observed source type/date controls.",
    operation: defaultSearchQnaOperation,
    prepareInput: (input) => resolveSearchQnaRequest(input as Record<string, unknown>),
    examples: [{ keyword: "리스", rows: 5 }, { keyword: "리스", sortDate: "desc", rows: 10 }],
    limitations: [
      "Uses observed public Q&A type ids; labels are provided for scanning but input types remain source-facing numeric CSV values.",
      "sortDate/from/to are client-side controls over a bounded fetched result window because the observed source endpoint ignores date filters.",
      "Use returned docNumber values with get-qna for full Q&A document context.",
    ],
    resultSummary: "Returns matching Q&A items, docNumber identifiers, type labels, pagination/count metadata, suggested keywords, references, and warnings.",
  },
  {
    name: "get-qna",
    label: "Get Q&A document",
    description: "Retrieve one KASB Q&A document by full docNumber.",
    operation: defaultGetQnaOperation,
    prepareInput: (input) => resolveGetQnaRequest(input as Record<string, unknown>),
    examples: [{ docNumber: "SSI-35629" }, { docNumber: "SSI-35629", keyword: "리스" }],
    limitations: [
      "docNumber must be the full KASB Q&A document number; numeric-only internal ids are not public inputs.",
      "contentHtml and related-standard HTML may be preserved for verification when supplied by the source.",
    ],
    resultSummary: "Returns the full Q&A document, source references, content metadata, and source warnings.",
  },
] as const satisfies readonly KasbOperationDefinition[];

const json = (value: unknown): string => JSON.stringify(value, null, 2);

const bulletList = (items: readonly string[]): string =>
  items.length === 0 ? "- None." : items.map((item) => `- ${item}`).join("\n");

export const formatKasbToolsetHelp = (help: KasbToolsetHelp): string => {
  const operations = help.operations.map(
    (operation) => `- ${operation.name}: ${operation.description}`,
  );

  return [
    `${help.label}: ${help.description}`,
    "",
    "Use as: kasb(action, command?, inputJson?)",
    "Actions:",
    ...kasbSingleToolActions.map(
      (action) => `- ${action}: ${kasbSingleToolCopy.actionSummaries[action]}`,
    ),
    "",
    "Commands:",
    ...operations,
    "",
    "Limitations:",
    bulletList(help.limitations),
    "",
    "Citation guidance:",
    bulletList(help.citationGuidance),
  ].join("\n");
};

export const formatKasbCommandHelp = (commandHelp: KasbCommandHelp): string =>
  [
    `Kasb command ${commandHelp.name}: ${commandHelp.description}`,
    `Required input keys: ${commandHelp.requiredInputKeys.join(", ") || "none"}`,
    "",
    "Input JSON Schema:",
    json(commandHelp.inputJsonSchema),
    "",
    "Examples:",
    json(commandHelp.examples),
    "",
    "Limitations:",
    bulletList(commandHelp.limitations),
    "",
    "Result summary:",
    commandHelp.resultSummary,
  ].join("\n");

export const formatKasbValidationSuccess = (
  command: string,
  validation: Extract<KasbValidationResult, { ok: true }>,
): string =>
  [
    `Kasb validation succeeded for ${command}.`,
    "Normalized input:",
    json(validation.input),
  ].join("\n");

export const formatKasbValidationFailure = (
  action: KasbSingleToolRunAction,
  command: string,
  error: KasbValidationFailure,
): string =>
  [
    `Kasb ${action} input validation failed for ${command}.`,
    "Repair feedback:",
    json(error),
  ].join("\n");

export const formatKasbRunSuccess = (command: string, result: unknown): string =>
  [
    `Kasb run succeeded for ${command}.`,
    "Use returned references, warnings, metadata, and source URLs for citations and follow-up commands.",
    "Result envelope:",
    json(result),
  ].join("\n");

export const formatKasbRunFailure = (
  command: string,
  error: KasbSerializedError,
): string => [`Kasb run failed for ${command}.`, "Error:", json(error)].join("\n");

export const formatKasbInvalidToolInput = (
  error: KasbValidationFailure,
): string => `Kasb tool input is invalid.\n${json(error)}`;

export const formatKasbUnknownCommand = (
  command: string,
  error: KasbSerializedError,
): string => `Unknown Kasb command: ${command}\n${json(error)}`;

const isAbortSignalAborted = (signal: AbortSignal | undefined): boolean => signal?.aborted === true;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasString = <Key extends string>(
  record: Record<string, unknown>,
  key: Key,
): record is Record<Key, string> & Record<string, unknown> => typeof record[key] === "string";

const createAbortError = (operationName?: string): KasbToolsetError =>
  new KasbToolsetError({
    code: "aborted",
    message: operationName
      ? `KASB operation was aborted: ${operationName}`
      : "KASB operation was aborted.",
    retryable: true,
    ...(operationName === undefined ? {} : { operationName }),
  });

const raceWithAbort = async <T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  operationName: string,
): Promise<T> => {
  if (signal === undefined) return promise;
  if (isAbortSignalAborted(signal)) throw createAbortError(operationName);

  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(createAbortError(operationName));

    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
};

const extractRequiredInputKeys = (inputJsonSchema: unknown): readonly string[] => {
  if (!isRecord(inputJsonSchema) || !Array.isArray(inputJsonSchema.required)) return [];
  return inputJsonSchema.required.filter((key): key is string => typeof key === "string");
};

const createCommandHelp = (definition: KasbOperationDefinition): KasbOperationSpec => ({
  name: definition.name,
  label: definition.label,
  description: definition.description,
  inputJsonSchema: definition.operation.inputJsonSchema,
  resultJsonSchema: definition.operation.resultJsonSchema,
  requiredInputKeys: extractRequiredInputKeys(definition.operation.inputJsonSchema),
  examples: definition.examples,
  limitations: definition.limitations,
  resultSummary: definition.resultSummary,
});

const inspectToolHelpRecoveryAction = {
  kind: "inspect_tool_help",
} as const satisfies KasbValidationRecoveryAction;

const inspectCommandHelpRecoveryAction = (operationName: KasbOperationName): KasbValidationRecoveryAction => ({
  kind: "inspect_command_help",
  operationName,
});

const isKasbOperationName = (value: unknown): value is KasbOperationName =>
  typeof value === "string" && kasbOperationNames.includes(value as KasbOperationName);

const recoveryActionForCommandInput = (command: string): KasbValidationRecoveryAction =>
  isKasbOperationName(command) ? inspectCommandHelpRecoveryAction(command) : inspectToolHelpRecoveryAction;

const createSingleToolValidationFailure = (input: {
  readonly code: KasbValidationFailure["code"];
  readonly message: string;
  readonly parameter: string;
  readonly reason: string;
  readonly expected?: string;
  readonly actual?: unknown;
  readonly command?: string;
  readonly recoveryHint?: string;
  readonly recoveryAction: KasbValidationRecoveryAction;
}): KasbValidationFailure => ({
  code: input.code,
  message: input.message,
  ...(input.command === undefined ? {} : { operationName: input.command }),
  parameter: input.parameter,
  reason: input.reason,
  ...(input.expected === undefined ? {} : { expected: input.expected }),
  ...("actual" in input ? { actual: input.actual } : {}),
  ...(input.recoveryHint === undefined ? {} : { recoveryHint: input.recoveryHint }),
  retryable: true,
  recoveryAction: input.recoveryAction,
});

export const createKasbSingleToolActionFailure = (actual: unknown): KasbValidationFailure =>
  createSingleToolValidationFailure({
    code: "invalid_parameter",
    message: "Kasb action must be one of help, command_help, validate, or run.",
    parameter: "action",
    reason: !isRecord(actual) ? "invalid_type" : "invalid_enum",
    expected: kasbSingleToolActions.join(","),
    actual: isRecord(actual) ? actual.action : actual,
    recoveryHint: "Call kasb with action=help for the command menu.",
    recoveryAction: inspectToolHelpRecoveryAction,
  });

export const createKasbSingleToolCommandFailure = (
  action: KasbSingleToolAction,
  command: unknown,
): KasbValidationFailure =>
  createSingleToolValidationFailure({
    code: command === undefined ? "missing_parameter" : "invalid_parameter",
    message: `Kasb action ${action} requires command to be a canonical operation name.`,
    parameter: "command",
    reason: command === undefined ? "required" : "invalid_type",
    expected: kasbOperationNames.join(","),
    actual: command,
    recoveryHint: "Call kasb with action=help to see canonical command names.",
    recoveryAction: inspectToolHelpRecoveryAction,
  });

export const createKasbSingleToolInputJsonFailure = (
  action: KasbSingleToolRunAction,
  command: string,
  inputJson: unknown,
): KasbValidationFailure =>
  createSingleToolValidationFailure({
    code: inputJson === undefined ? "missing_parameter" : "invalid_parameter",
    message: `Kasb action ${action} requires inputJson to be an object.`,
    parameter: "inputJson",
    reason: inputJson === undefined ? "required" : "invalid_type",
    expected: "object",
    actual: inputJson,
    command,
    recoveryHint: "Call kasb with action=command_help for the command's input schema and examples.",
    recoveryAction: recoveryActionForCommandInput(command),
  });

const createUnknownOperationValidationFailure = (name: string): KasbValidationFailure => ({
  code: "invalid_request",
  message: `Unknown KASB operation: ${name}`,
  operationName: name,
  parameter: "name",
  reason: "unknown_operation",
  expected: kasbOperationNames.join(","),
  actual: name,
  recoveryHint: "Use help() or listOperations() to choose a canonical KASB operation name.",
  retryable: true,
  recoveryAction: inspectToolHelpRecoveryAction,
});

const createInvalidInputValidationFailure = (
  operationName: KasbOperationName,
  actual: unknown,
  exampleInput: Record<string, unknown> | undefined,
): KasbValidationFailure => ({
  code: "invalid_parameter",
  message: "KASB operation input must be an object.",
  operationName,
  parameter: "input",
  reason: "invalid_type",
  expected: "object",
  actual,
  retryable: true,
  recoveryAction: inspectCommandHelpRecoveryAction(operationName),
  ...(exampleInput === undefined ? {} : { exampleInput }),
});

const toValidationFailure = (
  error: unknown,
  operationName: KasbOperationName,
  exampleInput: Record<string, unknown> | undefined,
): KasbValidationFailure => {
  if (isRecord(error)) {
    const parameter = hasString(error, "parameter") ? error.parameter : undefined;
    const code = toValidationFailureCode(error, parameter);
    const reason = hasString(error, "reason") ? error.reason : inferValidationReason(error, parameter);
    const expected = hasString(error, "expected") ? error.expected : expectedForReason(reason);
    const recoveryHint = hasString(error, "recoveryHint")
      ? error.recoveryHint
      : recoveryHintForValidation(operationName, parameter, reason);

    return {
      code,
      message: hasString(error, "message") ? error.message : "KASB input validation failed.",
      operationName,
      ...(parameter === undefined ? {} : { parameter }),
      ...(reason === undefined ? {} : { reason }),
      ...(expected === undefined ? {} : { expected }),
      ...("actual" in error ? { actual: error.actual } : {}),
      ...(recoveryHint === undefined ? {} : { recoveryHint }),
      ...(exampleInput === undefined ? {} : { exampleInput }),
      retryable: true,
      recoveryAction: inspectCommandHelpRecoveryAction(operationName),
    };
  }

  return {
    code: "invalid_request",
    message: "KASB input validation failed.",
    operationName,
    ...(exampleInput === undefined ? {} : { exampleInput }),
    retryable: true,
    recoveryAction: inspectCommandHelpRecoveryAction(operationName),
  };
};

const toValidationFailureCode = (
  error: Record<string, unknown>,
  parameter: string | undefined,
): KasbValidationFailureCode => {
  if (hasString(error, "code")) {
    switch (error.code) {
      case "missing_parameter":
      case "invalid_parameter":
      case "unknown_parameter":
        return error.code;
      default:
        break;
    }
  }
  const message = hasString(error, "message") ? error.message : "";
  if (message.includes("필수 매개변수")) return "missing_parameter";
  if (message.includes("알 수 없는 매개변수")) return "unknown_parameter";
  if (parameter !== undefined) return "invalid_parameter";
  return "invalid_request";
};

const inferValidationReason = (
  error: Record<string, unknown>,
  parameter: string | undefined,
): string | undefined => {
  const message = hasString(error, "message") ? error.message : "";
  if (message.includes("필수 매개변수")) return "required";
  if (message.includes("알 수 없는 매개변수")) return "unknown_parameter";
  if (message.includes("문자열이어야")) return "invalid_type";
  if (message.includes("정수여야")) return "invalid_type";
  if (message.includes("중 정확히 하나")) return "exclusive_or";
  return parameter === undefined ? undefined : "invalid_value";
};

const expectedForReason = (reason: string | undefined): string | undefined => {
  switch (reason) {
    case "required":
      return "required parameter";
    case "unknown_parameter":
      return "known semantic input field";
    case "invalid_type":
      return "value matching the operation input schema";
    case "exclusive_or":
      return "exactly one allowed section locator";
    default:
      return undefined;
  }
};

const recoveryHintForValidation = (
  operationName: KasbOperationName,
  parameter: string | undefined,
  reason: string | undefined,
): string | undefined => {
  if (reason === "unknown_parameter") {
    return `Call kasb command_help for ${operationName} and use the documented JSON input field names.`;
  }
  if (parameter === "indexDocumentId") {
    return "Run get-standard-structure for the standard and pass a returned indexDocumentId, or use get-section with ref.";
  }
  if (parameter === "paraNum") {
    return "Pass one exact paragraph number; use get-section with ref for ranges.";
  }
  if (parameter === "docNumber") {
    return "Run search-qna first and pass the full returned docNumber to get-qna.";
  }
  if (parameter !== undefined) {
    return `Call kasb command_help for ${operationName} to inspect ${parameter} requirements and examples.`;
  }
  return undefined;
};

const copyKnownErrorFields = (
  record: Record<string, unknown>,
): Omit<KasbSerializedError, "name" | "message"> => ({
  ...(typeof record.code === "string" ? { code: record.code } : {}),
  ...(typeof record.retryable === "boolean" ? { retryable: record.retryable } : {}),
  ...(typeof record.parameter === "string" ? { parameter: record.parameter } : {}),
  ...(typeof record.operationName === "string" ? { operationName: record.operationName } : {}),
  ...(typeof record.sourceUrl === "string" ? { sourceUrl: record.sourceUrl } : {}),
  ...(typeof record.recoveryHint === "string" ? { recoveryHint: record.recoveryHint } : {}),
});

export const serializeKasbError = (error: unknown): KasbSerializedError => {
  if (error instanceof Error) {
    const record = error as Error & Record<string, unknown>;
    return {
      name: error.name,
      message: error.message,
      ...copyKnownErrorFields(record),
    };
  }

  if (isRecord(error)) {
    return {
      name: hasString(error, "name") ? error.name : "UnknownError",
      message: hasString(error, "message") ? error.message : String(error),
      ...copyKnownErrorFields(error),
    };
  }

  return { name: "UnknownError", message: String(error) };
};

export const createKasbToolset = (options: CreateKasbToolsetOptions = {}): KasbToolset => {
  const definitions = options.operations ?? defaultOperationDefinitions;
  const operationByName = new Map(definitions.map((definition) => [definition.name, definition]));
  const summaries = () => definitions.map(({ name, label, description }) => ({ name, label, description }));
  const getCommandHelp = (name: string): KasbOperationSpec | undefined => {
    const definition = operationByName.get(name as KasbOperationName);
    return definition === undefined ? undefined : createCommandHelp(definition);
  };

  return {
    id: "kasb",
    label: "Kasb",
    description:
      "Read-only Korean KASB standards and Q&A operations with source references, warnings, and typed capability errors.",
    help: () => ({
      id: "kasb",
      label: "Kasb",
      description:
        "Read-only Korean KASB standards and Q&A operations with source references, warnings, and typed capability errors.",
      usage:
        "Inspect operations with listOperations()/getCommandHelp(name), validate input with validateInput(name, input), then run execute(name, input).",
      operations: summaries(),
      limitations: sourceLimitations,
      citationGuidance,
    }),
    listOperations: summaries,
    getOperation: getCommandHelp,
    getCommandHelp,
    validateInput: (name, input) => {
      const definition = operationByName.get(name as KasbOperationName);
      if (definition === undefined) {
        return { ok: false, error: createUnknownOperationValidationFailure(name) };
      }

      const [exampleInput] = definition.examples;
      try {
        if (!isRecord(input)) {
          return {
            ok: false,
            error: createInvalidInputValidationFailure(definition.name, input, exampleInput),
          };
        }
        return { ok: true, input: definition.prepareInput(input) };
      } catch (error) {
        return { ok: false, error: toValidationFailure(error, definition.name, exampleInput) };
      }
    },
    serializeError: serializeKasbError,
    execute: async (name, input, context) => {
      const definition = operationByName.get(name as KasbOperationName);
      if (definition === undefined) throw createKasbUnknownOperationError(name);
      if (isAbortSignalAborted(context?.signal)) throw createAbortError(name);
      return raceWithAbort(definition.operation.execute(input), context?.signal, name);
    },
  };
};
