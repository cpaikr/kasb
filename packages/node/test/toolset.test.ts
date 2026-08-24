import { describe, expect, test } from "bun:test";

import {
  KasbToolsetError,
  createKasbToolset,
  kasbOperationNames,
  serializeKasbError,
} from "../dist/toolset.js";

describe("Rust-backed Node toolset", () => {
  test("preserves ordered discovery and network-free validation", () => {
    const toolset = createKasbToolset();
    expect(toolset.listOperations().map(({ name }) => name)).toEqual([...kasbOperationNames]);
    expect(toolset.getOperation("get-paragraph")).toEqual(toolset.getCommandHelp("get-paragraph"));
    expect(toolset.getOperation("unknown")).toBeUndefined();
    expect(toolset.validateInput("search-standards", { keyword: " 리스 " })).toEqual({
      ok: true,
      input: { keyword: "리스", limit: 20, sort: "relevance" },
    });
    expect(toolset.validateInput("get-section", {
      stdNum: "1116",
      indexDocumentId: "ZB2hJW",
      unknown: true,
    })).toMatchObject({
      ok: false,
      error: { code: "unknown_parameter", parameter: "unknown" },
    });
  });

  test("keeps caller-supplied operations caller-owned", async () => {
    const execute = async (input: Record<string, unknown>) => ({ input });
    const toolset = createKasbToolset({
      operations: [{
        name: "get-paragraph",
        label: "Custom",
        description: "Custom test operation",
        operation: {
          name: "get-paragraph",
          inputJsonSchema: {},
          resultJsonSchema: {},
          execute,
        },
        examples: [{ custom: true }],
        limitations: [],
        resultSummary: "Custom",
        prepareInput: (input: unknown) => input as Record<string, unknown>,
      }],
    });
    await expect(toolset.execute("get-paragraph", { custom: true })).resolves.toEqual({
      input: { custom: true },
    });
  });

  test("projects unknown operations and serialized errors through the frozen allowlist", async () => {
    const toolset = createKasbToolset();
    await expect(toolset.execute("unknown", {})).rejects.toBeInstanceOf(KasbToolsetError);
    expect(serializeKasbError({
      name: "KasbFailure",
      message: "provider changed",
      code: "source_changed",
      retryable: false,
      sourceUrl: "https://db.kasb.or.kr/api/standard",
      stack: "secret",
      payload: { secret: true },
    })).toEqual({
      name: "KasbFailure",
      message: "provider changed",
      code: "source_changed",
      retryable: false,
      sourceUrl: "https://db.kasb.or.kr/api/standard",
    });
  });
});
