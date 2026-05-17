import { Command } from "commander";

import {
  buildCliNameByOptionKey,
  configureCliTransport,
  createPrettyOption,
  createRegisteredOption,
  extractCliOptions,
  parseIntegerCliOption,
  renderCliJson,
  renderInvalidInputCliErrorMessage,
  splitCliCommandOptions,
  type CliOptions as SharedCliOptions,
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
  readonly runOperation: (input: Partial<RawInput> & Record<string, unknown>) => Promise<Result>;
  readonly writeStdout: (text: string) => void;
};

export type BuiltCliCommand<Key extends string, RawInput> = {
  readonly command: Command;
  readonly renderErrorMessage: (error: unknown) => string | undefined;
  readonly parse: (options: SharedCliOptions<Key | "pretty">) => ParsedCliCommand<RawInput>;
};

export const buildOperationCommand = <Key extends string, RawInput, Result>(
  spec: CliCommandSpec<Key, RawInput, Result>,
): BuiltCliCommand<Key, RawInput> => {
  const registeredOptions = buildRegisteredOptions(spec);
  const cliNameByOptionKey = buildCliNameByOptionKey(registeredOptions);

  const toCommand = (options: SharedCliOptions<Key | "pretty">): ParsedCliCommand<RawInput> =>
    splitCliCommandOptions<RawInput, Key | "pretty">(options, ["pretty"]);

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
      .then((result) => spec.writeStdout(renderCliJson(result, parsed.output)));
  });

  return {
    command,
    parse: toCommand,
    renderErrorMessage: (error) =>
      renderInvalidInputCliErrorMessage(error as { code: string; message: string; parameter?: string }, cliNameByOptionKey),
  };
};

const buildRegisteredOptions = <Key extends string, RawInput, Result>(
  spec: CliCommandSpec<Key, RawInput, Result>,
): readonly RegisteredOption<Key | "pretty">[] => [
  ...spec.options.map((option) =>
    createRegisteredOption<Key | "pretty">(
      option.key,
      option.flags,
      option.description,
      option.integer === true
        ? (registeredOption) => registeredOption.argParser(parseIntegerCliOption)
        : undefined,
    ),
  ),
  createPrettyOption(),
];

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
