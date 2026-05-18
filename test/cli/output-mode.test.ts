import { describe, expect, test } from "bun:test";

import { buildOperationCommand } from "../../src/cli/commands/shared.ts";

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

const makeCommand = (writes: string[]) =>
  buildOperationCommand<keyof FakeInput, FakeInput, FakeResult>({
    operationName: "fake-operation",
    summary: "Fake operation.",
    description: "Fake operation for CLI output-mode tests.",
    options: [{ key: "id", flags: "--id <text>", description: "Fake id." }],
    outputModes: ["summary", "structured", "raw"],
    summarizeResult: (output) => ({ id: output.result.id }),
    runOperation: async (input) => ({
      result: {
        id: String(input.id),
        verbose: "large normalized content",
        rawHtml: "<p>source fragment</p>",
      },
      metadata: { source: "fixture" },
      references: { apiUrl: "https://example.test/api" },
      warnings: [],
    }),
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
});
