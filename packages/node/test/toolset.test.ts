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

  test.each([
    ["search-standards", "limit", 20],
    ["search-qna", "page", 1],
    ["search-qna", "rows", 10],
  ] as const)("rejects explicit null for %s %s while preserving optional defaults", (name, parameter, defaultValue) => {
    const toolset = createKasbToolset();
    expect(toolset.validateInput(name, { keyword: "리스", [parameter]: null })).toMatchObject({
      ok: false,
      error: { code: "invalid_parameter", parameter, reason: "invalid_type", actual: null },
    });
    for (const input of [{ keyword: "리스" }, { keyword: "리스", [parameter]: undefined }]) {
      expect(toolset.validateInput(name, input)).toMatchObject({
        ok: true,
        input: { [parameter]: defaultValue },
      });
    }
  });

  test("returns bounded, serializable failures for cyclic and deeply nested arrays", () => {
    const toolset = createKasbToolset();
    const cycle: unknown[] = [];
    cycle.push(cycle);
    let deep: unknown = "invalid";
    for (let index = 0; index < 20_000; index += 1) deep = [deep];
    let branching: unknown = "invalid";
    for (let index = 0; index < 20; index += 1) branching = Array(10).fill(branching);

    for (const actual of [cycle, deep, branching]) {
      for (const [input, parameter, code] of [
        [actual, "input", "invalid_request"],
        [{ keyword: actual }, "keyword", "invalid_parameter"],
      ] as const) {
        const result = toolset.validateInput("search-standards", input);
        expect(result).toMatchObject({ ok: false, error: { code, parameter, reason: "invalid_type" } });
        const serialized = JSON.stringify(result);
        expect(serialized.length).toBeLessThan(20_000);
        expect(JSON.parse(serialized)).toEqual(result);
      }
    }
    expect(toolset.validateInput("search-standards", { keyword: ["invalid", [1, null]] })).toMatchObject({
      ok: false,
      error: { actual: ["invalid", [1, null]] },
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
