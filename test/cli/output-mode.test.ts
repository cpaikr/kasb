import { describe, expect, test } from "bun:test";

import { buildOperationCommand } from "../../src/cli/commands/shared.ts";
import type { CliOutputMode } from "../../src/cli/command-helpers.ts";

type FakeInput = { readonly id: string };
type FakeResult = {
  readonly result: {
    readonly id: string;
    readonly verbose: string;
    readonly rawHtml: string;
  };
  readonly metadata: { readonly source: string };
  readonly references: { readonly apiUrl: string };
  readonly warnings: readonly [];
};

const allOutputModes = ["summary", "structured", "raw"] as const satisfies readonly CliOutputMode[];

const makeCommand = (
  writes: string[],
  options: {
    readonly outputModes?: readonly CliOutputMode[];
    readonly runCount?: { value: number };
  } = {},
) =>
  buildOperationCommand<keyof FakeInput, FakeInput, FakeResult>({
    operationName: "fake-operation",
    summary: "Fake operation.",
    description: "Fake operation for CLI output-mode tests.",
    options: [{ key: "id", flags: "--id <text>", description: "Fake id." }],
    outputModes: options.outputModes ?? allOutputModes,
    summarizeResult: (output) => ({ id: output.result.id }),
    runOperation: async (input) => {
      if (options.runCount !== undefined) options.runCount.value += 1;
      return {
        result: {
          id: String(input.id),
          verbose: "large normalized content",
          rawHtml: "<p>source fragment</p>",
        },
        metadata: { source: "fixture" },
        references: { apiUrl: "https://example.test/api" },
        warnings: [],
      };
    },
    writeStdout: (text) => writes.push(text),
  }).command;

describe("CLI output modes", () => {
  test("keeps structured output as the default envelope", async () => {
    const writes: string[] = [];
    await makeCommand(writes).parseAsync(["node", "test", "--id", "abc"], { from: "node" });
    const envelope = JSON.parse(writes[0] ?? "") as FakeResult;

    expect(envelope.result.verbose).toBe("large normalized content");
    expect(envelope.result.rawHtml).toBe("<p>source fragment</p>");
    expect(envelope.references.apiUrl).toBe("https://example.test/api");
  });

  test("projects only the result payload for summary output", async () => {
    const writes: string[] = [];
    await makeCommand(writes).parseAsync(["node", "test", "--id", "abc", "--output", "summary"], { from: "node" });
    const envelope = JSON.parse(writes[0] ?? "") as {
      readonly result: { readonly id: string; readonly verbose?: string; readonly rawHtml?: string };
      readonly metadata: { readonly source: string };
      readonly references: { readonly apiUrl: string };
      readonly warnings: readonly [];
    };

    expect(envelope.result).toEqual({ id: "abc" });
    expect(envelope.metadata.source).toBe("fixture");
    expect(envelope.references.apiUrl).toBe("https://example.test/api");
  });

  test("accepts raw output as the richest available structured envelope", async () => {
    const writes: string[] = [];
    await makeCommand(writes).parseAsync(["node", "test", "--id", "abc", "--output", "raw"], { from: "node" });
    const envelope = JSON.parse(writes[0] ?? "") as FakeResult;

    expect(envelope.result.rawHtml).toBe("<p>source fragment</p>");
  });

  test("honors a command's configured output-mode choices", async () => {
    const writes: string[] = [];
    const runCount = { value: 0 };
    const command = makeCommand(writes, { outputModes: ["summary", "structured"], runCount });

    expect(command.helpInformation()).toContain("출력 상세도를 선택합니다: summary, structured. 기본값은 structured입니다.");

    let error: unknown;
    try {
      await command.parseAsync(["node", "test", "--id", "abc", "--output", "raw"], { from: "node" });
    } catch (caught) {
      error = caught;
    }

    expect((error as { readonly code?: string }).code).toBe("commander.invalidArgument");
    expect(runCount.value).toBe(0);
    expect(writes).toEqual([]);
  });
});
