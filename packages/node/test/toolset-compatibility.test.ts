import { describe, expect, test } from "bun:test";

import {
  createKasbToolset,
  kasbOperationNames,
  type KasbOperationDefinition,
} from "../src/toolset.ts";

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
        recoverable: true,
        retryable: false,
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
        recoverable: true,
        retryable: false,
        recoveryAction: { kind: "inspect_command_help", operationName: "get-section" },
      });
    }

    const unknown = toolset.validateInput("missing", {});
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.error).toMatchObject({
        code: "invalid_request",
        parameter: "name",
        recoverable: true,
        retryable: false,
        recoveryAction: { kind: "inspect_tool_help" },
      });
    }

    const nonObject = toolset.validateInput("search-standards", "리스");
    expect(nonObject.ok).toBe(false);
    if (!nonObject.ok) {
      expect(nonObject.error).toMatchObject({
        code: "invalid_request",
        operationName: "search-standards",
        parameter: "input",
        recoverable: true,
        retryable: false,
        recoveryAction: { kind: "inspect_command_help", operationName: "search-standards" },
      });
      expect(nonObject.error.recoveryHint).toContain("getCommandHelp");
    }

    const unknownParameter = toolset.validateInput("search-standards", { query: "리스" });
    expect(unknownParameter.ok).toBe(false);
    if (!unknownParameter.ok) {
      expect(unknownParameter.error).toMatchObject({
        code: "unknown_parameter",
        operationName: "search-standards",
        parameter: "query",
        recoverable: true,
        retryable: false,
        recoveryAction: { kind: "inspect_command_help", operationName: "search-standards" },
      });
    }

    const invalidEnum = toolset.validateInput("search-standards", { keyword: "리스", sort: "recent" });
    expect(invalidEnum.ok).toBe(false);
    if (!invalidEnum.ok) {
      expect(invalidEnum.error).toMatchObject({
        code: "invalid_parameter",
        operationName: "search-standards",
        parameter: "sort",
        reason: "invalid_enum",
        expected: "relevance, match-count, std-num, title",
        actual: "recent",
        recoverable: true,
        retryable: false,
        recoveryAction: { kind: "inspect_command_help", operationName: "search-standards" },
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

    const validationError = toolset.serializeError({
      name: "ValidationError",
      message: "keyword is required",
      code: "missing_parameter",
      parameter: "keyword",
      recoverable: true,
      retryable: false,
      recoveryHint: "Inspect search-standards help and provide keyword.",
      recoveryAction: { kind: "inspect_command_help", operationName: "search-standards" },
      operationName: "search-standards",
    });
    expect(validationError).toEqual({
      name: "ValidationError",
      message: "keyword is required",
      code: "missing_parameter",
      parameter: "keyword",
      recoverable: true,
      retryable: false,
      recoveryHint: "Inspect search-standards help and provide keyword.",
      recoveryAction: { kind: "inspect_command_help", operationName: "search-standards" },
      operationName: "search-standards",
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

  test("rejects aborted execution with a serialized toolset error shape", async () => {
    const toolset = createKasbToolset({ operations: [createFakeOperation()] });
    const controller = new AbortController();
    controller.abort();

    await expect(
      toolset.execute("search-standards", { keyword: "리스" }, { signal: controller.signal }),
    ).rejects.toMatchObject({
      name: "KasbToolsetError",
      code: "aborted",
      operationName: "search-standards",
      recoverable: false,
      retryable: true,
    });
  });
});

