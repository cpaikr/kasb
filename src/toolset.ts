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
    message: `알 수 없는 KASB operation입니다: ${operationName}`,
    retryable: false,
    operationName,
  });

type AppOperation = {
  readonly name: KasbOperationName;
  readonly inputJsonSchema: unknown;
  readonly resultJsonSchema: unknown;
  readonly execute: (input: Record<string, unknown>, context?: KasbToolRunContext) => Promise<unknown>;
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
  "Kasb는 관찰된 공개 db.kasb.or.kr JSON API를 read-only로 읽습니다. 원천 동작은 변경될 수 있습니다.",
  "반환 content는 구조화된 원천 자료이며 회계, 법률, 투자, 세무 조언이 아닙니다.",
  "브라우저 경로의 titleDocumentId 값은 공개 섹션 input이 아닙니다. get-standard-structure로 indexDocumentId 값을 확인하세요.",
  "관찰된 원천 endpoint가 날짜 control을 무시하는 경우 Q&A 날짜 filtering과 ordering은 client-side로 적용됩니다.",
] as const;

const citationGuidance = [
  "결과를 인용할 때 result.references, metadata, warnings, stdNum/indexDocumentId/paraNum/docNumber, 반환된 원천 API URL을 함께 사용하세요.",
  "기준서 조사에서는 먼저 검색하고 기준서 구조를 확인한 뒤, 결론을 내리기 전에 섹션이나 정확한 문단을 조회하세요.",
  "Q&A 조사에서는 search-qna가 반환한 docNumber를 get-qna에 전달해 전체 문서 맥락을 확인하세요.",
] as const;

export const kasbSingleToolCopy = {
  description:
    "KASB 기준서와 Q&A 원천 자료를 read-only로 검색·조회하고 참조, warning, metadata를 함께 반환하는 도구입니다.",
  promptSnippet:
    "KASB 기준서 검색, 구조 조회, 섹션/문단 조회, Q&A 조회에는 kasb(action, command?, inputJson?)를 사용하세요.",
  promptGuidelines: [
    "명령 이름을 추측하지 말고 먼저 action=help로 사용할 수 있는 KASB command를 확인하세요.",
    "필수 key, 허용값, 예시, 제한사항, result shape가 불명확하면 action=command_help를 사용하세요.",
    "실제 KASB 접근 없이 command input을 수정하거나 정규화하려면 action=validate를 사용하세요.",
    "command input을 구성한 뒤에만 action=run을 사용하세요. Kasb는 실행 전에 검증하고 인용에 필요한 원천 참조, warning, metadata를 반환합니다.",
    "inputJson key에는 stdNum, indexDocumentId, paraNum, docNumber 같은 JSON field를 직접 사용하세요. CLI flag, 원천 searchWord, 브라우저 titleDocumentId를 전달하지 마세요.",
  ],
  parameterDescriptions: {
    action: "Kasb tool action입니다: help, command_help, validate, run 중 하나입니다.",
    command: "search-standards, get-paragraph 같은 canonical KASB operation name입니다.",
    inputJson: "선택한 KASB operation의 JSON input contract를 따르는 command input object입니다.",
  },
  actionSummaries: {
    help: "source-level help와 command menu를 반환합니다.",
    command_help: "하나의 command schema, 예시, 제한사항, result summary를 반환합니다.",
    validate: "실제 KASB 접근 없이 하나의 command input을 검증하고 정규화합니다.",
    run: "검증한 뒤 하나의 command를 실행합니다.",
  },
} as const satisfies KasbSingleToolCopy;

const defaultOperationDefinitions = [
  {
    name: "search-standards",
    label: "기준서 검색",
    description: "심층 조회 전에 검색어와 관련된 KASB 기준서를 찾습니다.",
    operation: defaultSearchStandardsOperation,
    prepareInput: (input) => resolveSearchStandardsRequest(input as Record<string, unknown>),
    examples: [{ keyword: "리스", limit: 10 }, { keyword: "수익인식", sort: "match-count" }],
    limitations: [
      "검색은 관찰된 /api/standard endpoint를 사용하며 원천 ranking 또는 metadata drift가 반영될 수 있습니다.",
      "섹션을 조회하기 전에 반환된 stdNum을 get-standard-structure에 사용하세요.",
    ],
    resultSummary: "매칭 기준서, 원천 match count, 제안 검색어, 참조, warning, 구조 조회용 nextActions를 반환합니다.",
  },
  {
    name: "get-standard-structure",
    label: "기준서 구조 조회",
    description: "하나의 기준서 섹션 tree를 반환하고 조회용 indexDocumentId 값을 노출합니다.",
    operation: defaultGetStandardStructureOperation,
    prepareInput: (input) => resolveGetStandardStructureRequest(input as Record<string, unknown>),
    examples: [{ stdNum: "1116" }, { stdNum: "1116", keyword: "리스" }],
    limitations: [
      "브라우저 title id가 아니라 standard-indexes를 사용합니다. get-section은 titleDocumentId를 받지 않습니다.",
      "keyword로 필터링한 구조에는 넓거나 noisy한 원천 match가 포함될 수 있습니다.",
    ],
    resultSummary: "indexDocumentId, title, ref, level, documentType, parent id, 원천 metadata, warning을 포함한 정규화된 섹션 node를 반환합니다.",
  },
  {
    name: "get-section",
    label: "섹션 조회",
    description: "indexDocumentId 또는 구조 index에서 resolve한 ref로 기준서 섹션 하나를 조회합니다.",
    operation: defaultGetSectionOperation,
    prepareInput: (input) => resolveGetSectionRequest(input as Record<string, unknown>),
    examples: [{ stdNum: "1116", indexDocumentId: "ZB2hJW" }, { stdNum: "1116", ref: "9~17" }],
    limitations: [
      "섹션 locator는 indexDocumentId 또는 ref 중 정확히 하나만 필요합니다.",
      "ref 조회는 현재 원천 구조를 통해 resolve하며, ref가 모호하면 warning을 반환할 수 있습니다.",
      "보존된 원천 HTML field는 도구가 해석하지 않고 metadata content note로 보고합니다.",
    ],
    resultSummary: "resolved 섹션 metadata와 순서 있는 title/paragraph clause를 citation, metadata, warning과 함께 반환합니다.",
  },
  {
    name: "get-paragraph",
    label: "문단 조회",
    description: "안정적인 stdNum + paraNum 참조로 정확한 KASB 문단 하나를 조회합니다.",
    operation: defaultGetParagraphOperation,
    prepareInput: (input) => resolveGetParagraphRequest(input as Record<string, unknown>),
    examples: [{ stdNum: "1116", paraNum: "23" }, { stdNum: "1116", paraNum: "B3" }],
    limitations: [
      "paraNum은 문단 범위가 아니라 정확한 문단 하나여야 합니다. 범위는 get-section의 ref를 사용하세요.",
      "구조 index를 확인할 수 있을 때 상위 섹션 metadata는 best-effort로 제공됩니다.",
    ],
    resultSummary: "uniqueKey, 원천 HTML/plain text, 상위 indexDocumentId, 참조, metadata, warning을 포함한 문단 하나를 반환합니다.",
  },
  {
    name: "search-qna",
    label: "Q&A 검색",
    description: "검색어와 선택적인 관찰 원천 type/date control로 KASB Q&A 문서를 검색합니다.",
    operation: defaultSearchQnaOperation,
    prepareInput: (input) => resolveSearchQnaRequest(input as Record<string, unknown>),
    examples: [{ keyword: "리스", rows: 5 }, { keyword: "리스", sortDate: "desc", rows: 10 }],
    limitations: [
      "관찰된 공개 Q&A type id를 사용합니다. label은 검토 편의를 위해 제공되지만 input types는 원천-facing 숫자 CSV 값입니다.",
      "관찰된 원천 endpoint가 날짜 filter를 무시하므로 sortDate/from/to는 제한된 fetch 결과 창에 대한 client-side control입니다.",
      "전체 Q&A 문서 맥락은 반환된 docNumber를 get-qna에 사용해 확인하세요.",
    ],
    resultSummary: "매칭 Q&A 항목, docNumber 식별자, type label, pagination/count metadata, 제안 검색어, 참조, warning을 반환합니다.",
  },
  {
    name: "get-qna",
    label: "Q&A 문서 조회",
    description: "전체 docNumber로 KASB Q&A 문서 하나를 조회합니다.",
    operation: defaultGetQnaOperation,
    prepareInput: (input) => resolveGetQnaRequest(input as Record<string, unknown>),
    examples: [{ docNumber: "SSI-35629" }, { docNumber: "SSI-35629", keyword: "리스" }],
    limitations: [
      "docNumber는 전체 KASB Q&A 문서 번호여야 합니다. 숫자만 있는 내부 id는 공개 input이 아닙니다.",
      "원천이 제공하는 경우 검증을 위해 contentHtml과 관련 기준서 HTML을 보존할 수 있습니다.",
    ],
    resultSummary: "전체 Q&A 문서, 원천 참조, content metadata, 원천 warning을 반환합니다.",
  },
] as const satisfies readonly KasbOperationDefinition[];

const json = (value: unknown): string => JSON.stringify(value, null, 2);

const bulletList = (items: readonly string[]): string =>
  items.length === 0 ? "- 없음." : items.map((item) => `- ${item}`).join("\n");

export const formatKasbToolsetHelp = (help: KasbToolsetHelp): string => {
  const operations = help.operations.map(
    (operation) => `- ${operation.name}: ${operation.description}`,
  );

  return [
    `${help.label}: ${help.description}`,
    "",
    "사용법: kasb(action, command?, inputJson?)",
    "동작:",
    ...kasbSingleToolActions.map(
      (action) => `- ${action}: ${kasbSingleToolCopy.actionSummaries[action]}`,
    ),
    "",
    "Command 목록:",
    ...operations,
    "",
    "제한사항:",
    bulletList(help.limitations),
    "",
    "인용 지침:",
    bulletList(help.citationGuidance),
  ].join("\n");
};

export const formatKasbCommandHelp = (commandHelp: KasbCommandHelp): string =>
  [
    `Kasb command ${commandHelp.name}: ${commandHelp.description}`,
    `필수 input key: ${commandHelp.requiredInputKeys.join(", ") || "없음"}`,
    "",
    "입력 JSON Schema:",
    json(commandHelp.inputJsonSchema),
    "",
    "예시:",
    json(commandHelp.examples),
    "",
    "제한사항:",
    bulletList(commandHelp.limitations),
    "",
    "결과 요약:",
    commandHelp.resultSummary,
  ].join("\n");

export const formatKasbValidationSuccess = (
  command: string,
  validation: Extract<KasbValidationResult, { ok: true }>,
): string =>
  [
    `Kasb validation이 성공했습니다: ${command}`,
    "정규화된 input:",
    json(validation.input),
  ].join("\n");

export const formatKasbValidationFailure = (
  action: KasbSingleToolRunAction,
  command: string,
  error: KasbValidationFailure,
): string =>
  [
    `Kasb ${action} input validation이 실패했습니다: ${command}`,
    "수정 안내:",
    json(error),
  ].join("\n");

export const formatKasbRunSuccess = (command: string, result: unknown): string =>
  [
    `Kasb run이 성공했습니다: ${command}`,
    "인용과 후속 command에는 반환된 references, warnings, metadata, source URL을 사용하세요.",
    "결과 envelope:",
    json(result),
  ].join("\n");

export const formatKasbRunFailure = (
  command: string,
  error: KasbSerializedError,
): string => [`Kasb run이 실패했습니다: ${command}`, "오류:", json(error)].join("\n");

export const formatKasbInvalidToolInput = (
  error: KasbValidationFailure,
): string => `Kasb tool input이 유효하지 않습니다.\n${json(error)}`;

export const formatKasbUnknownCommand = (
  command: string,
  error: KasbSerializedError,
): string => `알 수 없는 Kasb command입니다: ${command}\n${json(error)}`;

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
      ? `KASB operation이 중단되었습니다: ${operationName}`
      : "KASB operation이 중단되었습니다.",
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
    message: "Kasb action은 help, command_help, validate, run 중 하나여야 합니다.",
    parameter: "action",
    reason: !isRecord(actual) ? "invalid_type" : "invalid_enum",
    expected: kasbSingleToolActions.join(","),
    actual: isRecord(actual) ? actual.action : actual,
    recoveryHint: "command menu를 보려면 action=help로 kasb를 호출하세요.",
    recoveryAction: inspectToolHelpRecoveryAction,
  });

export const createKasbSingleToolCommandFailure = (
  action: KasbSingleToolAction,
  command: unknown,
): KasbValidationFailure =>
  createSingleToolValidationFailure({
    code: command === undefined ? "missing_parameter" : "invalid_parameter",
    message: `Kasb action ${action}에는 canonical operation name인 command가 필요합니다.`,
    parameter: "command",
    reason: command === undefined ? "required" : "invalid_type",
    expected: kasbOperationNames.join(","),
    actual: command,
    recoveryHint: "canonical command name을 보려면 action=help로 kasb를 호출하세요.",
    recoveryAction: inspectToolHelpRecoveryAction,
  });

export const createKasbSingleToolInputJsonFailure = (
  action: KasbSingleToolRunAction,
  command: string,
  inputJson: unknown,
): KasbValidationFailure =>
  createSingleToolValidationFailure({
    code: inputJson === undefined ? "missing_parameter" : "invalid_parameter",
    message: `Kasb action ${action}에는 object 형태의 inputJson이 필요합니다.`,
    parameter: "inputJson",
    reason: inputJson === undefined ? "required" : "invalid_type",
    expected: "object",
    actual: inputJson,
    command,
    recoveryHint: "해당 command의 input schema와 예시를 보려면 action=command_help로 kasb를 호출하세요.",
    recoveryAction: recoveryActionForCommandInput(command),
  });

const createUnknownOperationValidationFailure = (name: string): KasbValidationFailure => ({
  code: "invalid_request",
  message: `알 수 없는 KASB operation입니다: ${name}`,
  operationName: name,
  parameter: "name",
  reason: "unknown_operation",
  expected: kasbOperationNames.join(","),
  actual: name,
  recoveryHint: "canonical KASB operation name을 선택하려면 help() 또는 listOperations()를 사용하세요.",
  retryable: true,
  recoveryAction: inspectToolHelpRecoveryAction,
});

const createInvalidInputValidationFailure = (
  operationName: KasbOperationName,
  actual: unknown,
  exampleInput: Record<string, unknown> | undefined,
): KasbValidationFailure => ({
  code: "invalid_parameter",
  message: "KASB operation input은 object여야 합니다.",
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
      message: hasString(error, "message") ? error.message : "KASB input validation이 실패했습니다.",
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
    message: "KASB input validation이 실패했습니다.",
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
      return "필수 매개변수";
    case "unknown_parameter":
      return "알려진 의미 기반 input field";
    case "invalid_type":
      return "operation input schema와 일치하는 값";
    case "exclusive_or":
      return "허용된 섹션 locator 정확히 하나";
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
    return `kasb command_help로 ${operationName}의 문서화된 JSON input field name을 확인해 사용하세요.`;
  }
  if (parameter === "indexDocumentId") {
    return "해당 기준서에 get-standard-structure를 실행해 반환된 indexDocumentId를 전달하거나, get-section에 ref를 사용하세요.";
  }
  if (parameter === "paraNum") {
    return "정확한 문단 번호 하나를 전달하세요. 범위는 get-section의 ref를 사용하세요.";
  }
  if (parameter === "docNumber") {
    return "먼저 search-qna를 실행하고 반환된 전체 docNumber를 get-qna에 전달하세요.";
  }
  if (parameter !== undefined) {
    return `${parameter} 요구사항과 예시를 확인하려면 kasb command_help로 ${operationName}을 확인하세요.`;
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
      "KASB 기준서와 Q&A를 read-only로 검색·조회하고 원천 참조, warning, typed capability error를 반환합니다.",
    help: () => ({
      id: "kasb",
      label: "Kasb",
      description:
        "KASB 기준서와 Q&A를 read-only로 검색·조회하고 원천 참조, warning, typed capability error를 반환합니다.",
      usage:
        "listOperations()/getCommandHelp(name)로 operation을 확인하고 validateInput(name, input)으로 input을 검증한 뒤 execute(name, input)을 실행하세요.",
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
      return raceWithAbort(definition.operation.execute(input, context), context?.signal, name);
    },
  };
};
