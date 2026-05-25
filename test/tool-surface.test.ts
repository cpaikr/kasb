import { describe, expect, test } from "bun:test";

import { createKasbPiTool, kasbPiToolParameters, registerKasbPiTool } from "../src/pi.ts";
import {
  createKasbToolset,
  kasbOperationNames,
  kasbSingleToolActions,
  type KasbOperationDefinition,
} from "../src/toolset.ts";

const asRecord = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;
const textContent = (value: { readonly content: readonly { readonly text: string }[] }): string => value.content[0]?.text ?? "";

const createFakeOperation = (): KasbOperationDefinition => {
  const inputJsonSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      keyword: { type: "string", description: "Keyword.", examples: ["리스"] },
    },
    required: ["keyword"],
  };
  const resultJsonSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      result: { type: "object" },
      metadata: { type: "object" },
      references: { type: "object" },
      warnings: { type: "array" },
    },
    required: ["result", "metadata", "references", "warnings"],
  };

  return {
    name: "search-standards",
    label: "Search standards",
    description: "Fake search operation for tool-surface tests.",
    operation: {
      name: "search-standards",
      inputJsonSchema,
      resultJsonSchema,
      execute: async (input) => ({
        result: { request: input, returnedCount: 0, standards: [] },
        metadata: { fake: true },
        references: {},
        warnings: [],
      }),
    },
    prepareInput: (input) => {
      if (typeof input !== "object" || input === null || Array.isArray(input)) {
        throw { parameter: "input", message: "Input must be an object." };
      }
      const record = input as Record<string, unknown>;
      if (typeof record.keyword !== "string" || record.keyword.trim().length === 0) {
        throw { parameter: "keyword", message: 'Missing required parameter "keyword".' };
      }
      return { keyword: record.keyword.trim() };
    },
    examples: [{ keyword: "리스" }],
    limitations: ["Fixture operation for tests only."],
    resultSummary: "Returns a fake KASB result envelope.",
  };
};

describe("neutral KASB toolset surface", () => {
  test("exposes operation discovery, help, schemas, examples, and result summaries", () => {
    const toolset = createKasbToolset();

    expect(toolset.id).toBe("kasb");
    expect(toolset.label).toBe("KASB standards and Q&A search");
    expect(toolset.description).toContain("KASB");
    expect(toolset.listOperations().map((operation) => operation.name)).toEqual([
      ...kasbOperationNames,
    ]);

    const help = toolset.help();
    expect(help.id).toBe("kasb");
    expect(help.operations).toHaveLength(kasbOperationNames.length);
    expect(help.limitations.join("\n")).toContain("read-only");
    expect(help.citationGuidance.join("\n")).toContain("result.references");

    for (const operationName of kasbOperationNames) {
      const commandHelp = toolset.getCommandHelp(operationName);
      expect(commandHelp?.name).toBe(operationName);
      expect(commandHelp?.inputJsonSchema).toBeObject();
      expect(commandHelp?.resultJsonSchema).toBeObject();
      expect(commandHelp?.examples.length).toBeGreaterThan(0);
      expect(commandHelp?.limitations.length).toBeGreaterThan(0);
      expect(commandHelp?.resultSummary.length).toBeGreaterThan(0);
    }
  });

  test("validates inputs without executing source calls", () => {
    const toolset = createKasbToolset();

    expect(toolset.validateInput("search-standards", { keyword: " 리스 ", limit: 3 })).toEqual({
      ok: true,
      input: { keyword: "리스", limit: 3, sort: "relevance" },
    });

    const invalid = toolset.validateInput("get-paragraph", { stdNum: "1116" });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.error).toMatchObject({
        code: "missing_parameter",
        operationName: "get-paragraph",
        parameter: "paraNum",
        retryable: true,
        recoveryAction: { kind: "inspect_command_help", operationName: "get-paragraph" },
      });
      expect(invalid.error.recoveryHint).toContain("paragraph");
    }

    const missingSectionLocator = toolset.validateInput("get-section", { stdNum: "1116" });
    expect(missingSectionLocator.ok).toBe(false);
    if (!missingSectionLocator.ok) {
      expect(missingSectionLocator.error).toMatchObject({
        code: "missing_parameter",
        operationName: "get-section",
        parameter: "indexDocumentId",
        reason: "exclusive_or",
        expected: "exactly one accepted section locator",
        retryable: true,
        recoveryAction: { kind: "inspect_command_help", operationName: "get-section" },
      });
    }

    const unknown = toolset.validateInput("missing", {});
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.error).toMatchObject({
        code: "invalid_request",
        parameter: "name",
        retryable: true,
        recoveryAction: { kind: "inspect_tool_help" },
      });
    }
  });

  test("executes through the neutral operation table and serializes errors", async () => {
    const toolset = createKasbToolset({ operations: [createFakeOperation()] });

    const result = await toolset.execute("search-standards", { keyword: "리스" });
    expect(result).toMatchObject({
      result: { request: { keyword: "리스" } },
      metadata: { fake: true },
    });

    const error = toolset.serializeError({
      name: "SourceError",
      message: "source unavailable",
      code: "source_unavailable",
      retryable: true,
      sourceUrl: "https://db.kasb.or.kr/api/example",
    });
    expect(error).toEqual({
      name: "SourceError",
      message: "source unavailable",
      code: "source_unavailable",
      retryable: true,
      sourceUrl: "https://db.kasb.or.kr/api/example",
    });
  });

  test("passes execution context to operations", async () => {
    const fakeOperation = createFakeOperation();
    let receivedSignal: AbortSignal | undefined;
    const toolset = createKasbToolset({
      operations: [{
        ...fakeOperation,
        operation: {
          ...fakeOperation.operation,
          execute: async (input, context) => {
            receivedSignal = context?.signal;
            return fakeOperation.operation.execute(input, context);
          },
        },
      }],
    });
    const controller = new AbortController();

    await toolset.execute("search-standards", { keyword: "리스" }, { signal: controller.signal });

    expect(receivedSignal).toBe(controller.signal);
  });
});

describe("Pi KASB adapter surface", () => {
  test("publishes one package-level tool with single-tool action parameters", () => {
    const tool = createKasbPiTool({ toolset: createKasbToolset({ operations: [createFakeOperation()] }) });

    expect(tool.name).toBe("kasb");
    expect(tool.description).toContain("KASB");
    expect(tool.promptSnippet).toContain("kasb(action");
    expect(tool.promptGuidelines.length).toBeGreaterThan(0);
    expect(tool.parameters).toEqual(kasbPiToolParameters);
    expect(asRecord(kasbPiToolParameters.properties).action).toMatchObject({
      enum: [...kasbSingleToolActions],
    });
    expect(asRecord(kasbPiToolParameters.properties).command).toMatchObject({
      enum: [...kasbOperationNames],
    });
  });

  test("returns text content plus structured details for help, command_help, validate, and run", async () => {
    const tool = createKasbPiTool({ toolset: createKasbToolset({ operations: [createFakeOperation()] }) });

    const help = await tool.execute("call-1", { action: "help" });
    expect(help.content[0]?.type).toBe("text");
    expect(asRecord(help.details)).toMatchObject({ ok: true, action: "help" });

    const commandHelp = await tool.execute("call-2", {
      action: "command_help",
      command: "search-standards",
    });
    expect(asRecord(commandHelp.details)).toMatchObject({
      ok: true,
      action: "command_help",
      command: "search-standards",
    });
    expect(asRecord(commandHelp.details).commandHelp).toBeObject();
    expect(textContent(commandHelp)).toStartWith("Kasb search-standards command help.\n");

    const validate = await tool.execute("call-3", {
      action: "validate",
      command: "search-standards",
      inputJson: { keyword: " 리스 " },
    });
    expect(asRecord(validate.details)).toMatchObject({
      ok: true,
      action: "validate",
      command: "search-standards",
      validation: { ok: true, input: { keyword: "리스" } },
    });
    expect(textContent(validate)).toStartWith("Kasb search-standards input validation succeeded.\nNormalized input:");

    const run = await tool.execute("call-4", {
      action: "run",
      command: "search-standards",
      inputJson: { keyword: "리스" },
    });
    expect(asRecord(run.details)).toMatchObject({
      ok: true,
      action: "run",
      command: "search-standards",
      normalizedInput: { keyword: "리스" },
      result: { result: { request: { keyword: "리스" } } },
    });
    expect(textContent(run)).toStartWith("Kasb search-standards run succeeded.\n");
  });

  test("returns structured adapter and validation failures", async () => {
    const tool = createKasbPiTool({ toolset: createKasbToolset({ operations: [createFakeOperation()] }) });

    const invalidAction = await tool.execute("call-1", { action: "bad" } as never);
    expect(asRecord(invalidAction.details)).toMatchObject({
      ok: false,
      action: "adapter_validation",
      error: { code: "invalid_parameter", parameter: "action", retryable: true },
    });
    expect(textContent(invalidAction)).toStartWith("Kasb tool input is invalid.\n");

    const missingInput = await tool.execute("call-2", {
      action: "run",
      command: "search-standards",
    });
    expect(asRecord(missingInput.details)).toMatchObject({
      ok: false,
      action: "run",
      command: "search-standards",
      error: { code: "missing_parameter", parameter: "inputJson", retryable: true },
    });
    expect(textContent(missingInput)).toStartWith("Kasb tool input is invalid.\n");

    const invalidCommandInput = await tool.execute("call-3", {
      action: "validate",
      command: "search-standards",
      inputJson: {},
    });
    expect(asRecord(invalidCommandInput.details)).toMatchObject({
      ok: false,
      action: "validate",
      command: "search-standards",
      error: { code: "missing_parameter", parameter: "keyword", retryable: true },
    });
    expect(textContent(invalidCommandInput)).toStartWith("Kasb search-standards input validation failed during validate.\nRepair guidance:");

    const unknownCommand = await tool.execute("call-4", {
      action: "command_help",
      command: "missing",
    });
    expect(asRecord(unknownCommand.details)).toMatchObject({
      ok: false,
      action: "command_help",
      command: "missing",
      error: { code: "unknown_operation", operationName: "missing", retryable: false },
    });
    expect(textContent(unknownCommand)).toStartWith("Kasb command is unknown: missing\n");
  });

  test("returns English run failure text when operation execution fails", async () => {
    const fakeOperation = createFakeOperation();
    const tool = createKasbPiTool({
      toolset: createKasbToolset({
        operations: [{
          ...fakeOperation,
          operation: {
            ...fakeOperation.operation,
            execute: async () => {
              throw new Error("source unavailable");
            },
          },
        }],
      }),
    });

    const failure = await tool.execute("call-1", {
      action: "run",
      command: "search-standards",
      inputJson: { keyword: "리스" },
    });

    expect(asRecord(failure.details)).toMatchObject({
      ok: false,
      action: "run",
      command: "search-standards",
      error: { message: "source unavailable" },
    });
    expect(textContent(failure)).toStartWith("Kasb search-standards run failed.\nError:");
  });

  test("registers the Pi extension tool", () => {
    const registered: unknown[] = [];

    registerKasbPiTool({
      registerTool: (tool) => registered.push(tool),
    }, { toolset: createKasbToolset({ operations: [createFakeOperation()] }) });

    expect(registered).toHaveLength(1);
    expect(asRecord(registered[0]).name).toBe("kasb");
  });
});
