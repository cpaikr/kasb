import { Command } from "commander";

import {
  buildCliNameByOptionKey,
  configureCliTransport,
  createOutputOption,
  createPrettyOption,
  createRegisteredOption,
  extractCliOptions,
  parseIntegerCliOption,
  renderCliJson,
  renderInvalidInputCliErrorMessage,
  renderUnknownOptionCliErrorMessage,
  splitCliCommandOptions,
  type CliOptions as SharedCliOptions,
  type CliOutputMode,
  type ParsedCliCommand,
  type RegisteredOption,
} from "../command-helpers.ts";

export type CliCommandSpec<Key extends string, RawInput, Result> = {
  readonly operationName: string;
  readonly summary: string;
  readonly description: string;
  readonly notes?: readonly string[];
  readonly examples?: readonly { readonly description: string; readonly argv: readonly string[] }[];
  readonly options: readonly {
    readonly key: Key;
    readonly flags: string;
    readonly description: string;
    readonly integer?: boolean;
  }[];
  readonly outputModes?: readonly CliOutputMode[];
  readonly summarizeResult?: (result: Result) => unknown;
  readonly runOperation: (input: Partial<RawInput> & Record<string, unknown>) => Promise<Result>;
  readonly writeStdout: (text: string) => void;
};

export type BuiltCliCommand<Key extends string, RawInput> = {
  readonly command: Command;
  readonly renderErrorMessage: (error: unknown) => string | undefined;
  readonly parse: (options: SharedCliOptions<Key | "pretty" | "output">) => ParsedCliCommand<RawInput>;
};

export const buildOperationCommand = <Key extends string, RawInput, Result>(
  spec: CliCommandSpec<Key, RawInput, Result>,
): BuiltCliCommand<Key, RawInput> => {
  const registeredOptions = buildRegisteredOptions(spec);
  const cliNameByOptionKey = buildCliNameByOptionKey(registeredOptions);

  const toCommand = (options: SharedCliOptions<Key | "pretty" | "output">): ParsedCliCommand<RawInput> =>
    splitCliCommandOptions<RawInput, Key | "pretty" | "output">(options, ["pretty", "output"]);

  const command = configureCliTransport(new Command(spec.operationName))
    .summary(spec.summary)
    .description(spec.description)
    .helpOption("-h, --help", "명령 도움말을 표시합니다.")
    .addHelpText("after", renderSupplementalHelp(spec));

  for (const registeredOption of registeredOptions) {
    command.addOption(registeredOption.option);
  }

  command.action(() => {
    const options = extractCliOptions(
      command.opts<Record<string, unknown>>(),
      registeredOptions,
    );

    if (Object.keys(options).length === 0) {
      command.outputHelp();
      return undefined;
    }

    const parsed = toCommand(options);
    return spec
      .runOperation(parsed.request)
      .then((result) => {
        const projectedResult = projectResult(result, parsed.output.output, spec.summarizeResult);
        spec.writeStdout(renderCliJson(projectedResult, parsed.output));
      });
  });

  return {
    command,
    parse: toCommand,
    renderErrorMessage: (error) =>
      renderUnknownOptionCliErrorMessage(error, registeredOptions) ??
      renderInvalidInputCliErrorMessage(error as { code: string; message: string; parameter?: string }, cliNameByOptionKey),
  };
};

const buildRegisteredOptions = <Key extends string, RawInput, Result>(
  spec: CliCommandSpec<Key, RawInput, Result>,
): readonly RegisteredOption<Key | "pretty" | "output">[] => [
  ...spec.options.map((option) =>
    createRegisteredOption<Key | "pretty" | "output">(
      option.key,
      option.flags,
      option.description,
      option.integer === true
        ? (registeredOption) => registeredOption.argParser(parseIntegerCliOption)
        : undefined,
    ),
  ),
  ...(spec.outputModes === undefined ? [] : [createOutputOption(spec.outputModes)]),
  createPrettyOption(),
];

const projectResult = <Result>(
  result: Result,
  outputMode: CliOutputMode,
  summarizeResult: ((result: Result) => unknown) | undefined,
): Result | unknown => {
  if (outputMode !== "summary" || summarizeResult === undefined || !isResultEnvelope(result)) return result;
  return { ...result, result: summarizeResult(result) };
};

const isResultEnvelope = (value: unknown): value is {
  readonly result: unknown;
  readonly metadata: unknown;
  readonly references: unknown;
  readonly warnings: unknown;
} =>
  value !== null &&
  typeof value === "object" &&
  "result" in value &&
  "metadata" in value &&
  "references" in value &&
  "warnings" in value;

const renderSupplementalHelp = <Key extends string, RawInput, Result>(
  spec: CliCommandSpec<Key, RawInput, Result>,
): string => {
  const examples = (spec.examples ?? [])
    .map(
      (example) =>
        `  # ${example.description}\n  kasb ${spec.operationName} ${example.argv.join(" ")}`,
    )
    .join("\n\n");
  const examplesSection = examples.length > 0 ? `\n예시:\n${examples}` : "";
  const notes = (spec.notes ?? []).map((note) => `  - ${note}`).join("\n");
  const notesSection = notes.length > 0 ? `\n\n참고:\n${notes}` : "";
  return `${examplesSection}${notesSection}\n`;
};
