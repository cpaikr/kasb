import { Command, InvalidArgumentError, Option } from "commander";

export type CliOptionValue = boolean | number | string | readonly string[];

export const exitAfterHelpOrThrowCommanderError = (error: {
  readonly code: string;
  readonly exitCode: number;
}): never => {
  if (error.code === "commander.helpDisplayed" || error.code === "commander.help") {
    process.exit(error.exitCode);
  }
  throw error;
};

export const configureCliTransport = (command: Command): Command =>
  command.exitOverride(exitAfterHelpOrThrowCommanderError).configureOutput({
    writeErr: () => undefined,
  });

export type CliOutputMode = "summary" | "structured" | "raw";

export type CliJsonOptions = {
  readonly pretty: boolean;
  readonly output: CliOutputMode;
};

export type ParsedCliCommand<RequestInput> = {
  readonly request: Partial<RequestInput> & Record<string, unknown>;
  readonly output: CliJsonOptions;
};

export type RegisteredOption<Key extends string> = {
  readonly key: Key;
  readonly attributeName: string;
  readonly cliName: string;
  readonly option: Option;
};

export type CliFailureNextAction = {
  readonly operation: string;
  readonly command?: string;
  readonly reason: string;
  readonly input?: Record<string, unknown>;
};

export type CliErrorDetails = {
  readonly message?: string;
  readonly cliOption?: string;
  readonly nextAction?: CliFailureNextAction;
};

export type CliOptions<Key extends string> = Partial<Record<Key, CliOptionValue>> &
  Record<string, unknown>;

export const parseIntegerCliOption = (value: string): number => {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError(`정수를 입력해야 하지만 "${value}"을(를) 받았습니다.`);
  }
  return Number.parseInt(value, 10);
};

export const createRegisteredOption = <Key extends string>(
  key: Key,
  flags: string,
  description: string,
  configure?: (option: Option) => void,
): RegisteredOption<Key> => {
  const option = new Option(flags, description);
  const cliName = flags.split(/[ ,]+/).find((token) => token.startsWith("--"));
  if (cliName === undefined) throw new Error(`Missing long flag for ${key}.`);
  configure?.(option);
  return { key, attributeName: option.attributeName(), cliName, option };
};

export const createPrettyOption = (): RegisteredOption<"pretty"> =>
  createRegisteredOption("pretty", "--pretty", "사람이 읽기 쉬운 들여쓰기 JSON으로 출력합니다.");

export const createOutputOption = (outputModes: readonly CliOutputMode[]): RegisteredOption<"output"> =>
  createRegisteredOption("output", "--output <mode>", `출력 상세도를 선택합니다: ${outputModes.join(", ")}. 기본값은 structured입니다.`, (option) =>
    option.choices([...outputModes]),
  );

export const extractCliOptions = <Key extends string>(
  rawOptions: Record<string, unknown>,
  registeredOptions: readonly RegisteredOption<Key>[],
): CliOptions<Key> => {
  const options: CliOptions<Key> = {};
  for (const registeredOption of registeredOptions) {
    const value = rawOptions[registeredOption.attributeName];
    if (value !== undefined) {
      (options as Record<string, CliOptionValue>)[registeredOption.key] = value as CliOptionValue;
    }
  }
  return options;
};

export const buildCliNameByOptionKey = <Key extends string>(
  registeredOptions: readonly RegisteredOption<Key>[],
): Partial<Record<Key, string>> => {
  const cliNamesByKey = new Map<Key, string[]>();
  for (const option of registeredOptions) {
    const cliNames = cliNamesByKey.get(option.key) ?? [];
    cliNames.push(option.cliName);
    cliNamesByKey.set(option.key, cliNames);
  }
  return Object.fromEntries(
    [...cliNamesByKey.entries()].map(([key, cliNames]) => [key, cliNames.join("/")]),
  ) as Partial<Record<Key, string>>;
};

export const findUsedCliNameForOptionKey = <Key extends string>(
  key: Key,
  registeredOptions: readonly RegisteredOption<Key>[],
  rawOptions: Record<string, unknown>,
): string | undefined => {
  for (const option of [...registeredOptions].reverse()) {
    if (option.key === key && rawOptions[option.attributeName] !== undefined) {
      return option.cliName;
    }
  }
  return undefined;
};

export const renderInvalidInputCliErrorDetails = <Key extends string>(
  error: { readonly code: string; readonly parameter?: string; readonly message: string },
  cliNameByOptionKey: Partial<Record<Key, string>>,
  registeredOptions: readonly RegisteredOption<Key>[],
  rawOptions: Record<string, unknown>,
): CliErrorDetails | undefined => {
  if (error.code !== "invalid_input" || error.parameter === undefined) return undefined;
  const parameterKey = error.parameter as Key;
  const usedCliName = findUsedCliNameForOptionKey(parameterKey, registeredOptions, rawOptions);
  const cliName = usedCliName ?? cliNameByOptionKey[parameterKey];
  if (cliName === undefined) return undefined;
  let message = error.message
    .replaceAll("필수 매개변수", "필수 옵션")
    .replaceAll("매개변수", "옵션");
  for (const [key, optionCliName] of Object.entries(cliNameByOptionKey)) {
    const replacementCliName = key === error.parameter ? cliName : optionCliName;
    if (replacementCliName !== undefined) {
      message = message.replaceAll(`"${key}"`, `"${replacementCliName}"`);
    }
  }
  return {
    message,
    ...(usedCliName === undefined ? {} : { cliOption: usedCliName }),
  };
};

export const renderUnknownOptionCliErrorMessage = <Key extends string>(
  error: unknown,
  registeredOptions: readonly RegisteredOption<Key>[],
): string | undefined => {
  const message = toErrorMessage(error);
  const unknownOption = message.match(/unknown option '([^']+)'/u)?.[1];
  if (unknownOption === undefined) return undefined;

  const suggestedOption = suggestCliOption(unknownOption, registeredOptions);
  if (suggestedOption === undefined) return undefined;
  return `${message}. 대신 ${suggestedOption} 옵션을 사용하세요.`;
};

const suggestCliOption = <Key extends string>(
  unknownOption: string,
  registeredOptions: readonly RegisteredOption<Key>[],
): string | undefined => {
  const candidates = cliOptionAliases[unknownOption] ?? [];
  const knownOptions = new Set(registeredOptions.map((option) => option.cliName));
  return candidates.find((candidate) => knownOptions.has(candidate));
};

const cliOptionAliases: Record<string, readonly string[]> = {
  "--query": ["--keyword"],
  "--search-word": ["--keyword"],
};

export const splitCliCommandOptions = <RequestInput, Key extends string>(
  options: CliOptions<Key>,
  outputKeys: readonly Key[],
): ParsedCliCommand<RequestInput> => {
  const outputKeySet = new Set<string>(outputKeys);
  const request = Object.fromEntries(
    Object.entries(options).filter(([key]) => !outputKeySet.has(key)),
  );
  return {
    request: request as Partial<RequestInput> & Record<string, unknown>,
    output: {
      pretty: options.pretty === true,
      output: isCliOutputMode(options.output) ? options.output : "structured",
    },
  };
};

export type CliFailureCode =
  | "invalid_input"
  | "not_found"
  | "source_unavailable"
  | "source_changed"
  | "partial_retrieval"
  | "internal_failure";

export type CliFailureEnvelope = {
  readonly failure: {
    readonly code: CliFailureCode;
    readonly message: string;
    readonly retryable: boolean;
    readonly parameter?: string;
    readonly cliOption?: string;
    readonly sourceUrl?: string;
    readonly nextAction?: CliFailureNextAction;
  };
  readonly metadata: { readonly cliTransportVersion: "1"; readonly operation?: string };
  readonly warnings: readonly [];
};

export const renderCliJson = (
  value: unknown,
  options: Partial<CliJsonOptions> = {},
): string => JSON.stringify(value, undefined, options.pretty === true ? 2 : undefined);

const isCliOutputMode = (value: unknown): value is CliOutputMode =>
  value === "summary" || value === "structured" || value === "raw";

export const renderCliFailureJson = (
  error: unknown,
  options: Partial<CliJsonOptions> & CliErrorDetails & { readonly operation?: string } = {},
): string => renderCliJson(toCliFailureEnvelope(error, options), options);

const toCliFailureEnvelope = (
  error: unknown,
  options: CliErrorDetails & { readonly operation?: string },
): CliFailureEnvelope => ({
  failure: toCliFailureError(error, options),
  metadata: {
    cliTransportVersion: "1",
    ...(options.operation === undefined ? {} : { operation: options.operation }),
  },
  warnings: [],
});

const toCliFailureError = (error: unknown, options: CliErrorDetails): CliFailureEnvelope["failure"] => {
  const message = options.message ?? toErrorMessage(error);
  const transportFields = {
    ...(options.cliOption === undefined ? {} : { cliOption: options.cliOption }),
    ...(options.nextAction === undefined ? {} : { nextAction: options.nextAction }),
  };
  if (isTypedCliFailure(error)) {
    return {
      code: error.code,
      message,
      retryable: error.retryable,
      ...(error.parameter === undefined ? {} : { parameter: error.parameter }),
      ...(error.sourceUrl === undefined ? {} : { sourceUrl: error.sourceUrl }),
      ...transportFields,
    };
  }
  if (isCommanderError(error)) {
    return { code: "invalid_input", message, retryable: false, ...transportFields };
  }
  return { code: "internal_failure", message, retryable: false, ...transportFields };
};

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const cliFailureCodes = new Set<string>([
  "invalid_input",
  "not_found",
  "source_unavailable",
  "source_changed",
  "partial_retrieval",
  "internal_failure",
]);

const isTypedCliFailure = (
  error: unknown,
): error is {
  readonly code: CliFailureCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly parameter?: string | undefined;
  readonly sourceUrl?: string | undefined;
} =>
  isRecord(error) &&
  typeof error.code === "string" &&
  cliFailureCodes.has(error.code) &&
  typeof error.message === "string" &&
  typeof error.retryable === "boolean";

const isCommanderError = (error: unknown): boolean =>
  isRecord(error) && typeof error.code === "string" && error.code.startsWith("commander.");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";
