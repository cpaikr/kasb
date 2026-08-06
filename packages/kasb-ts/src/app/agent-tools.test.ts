import { describe, expect, test } from "bun:test";

import {
  defaultKasbAgentTools,
  getKasbAgentTool,
  isKasbAgentToolName,
  kasbAgentToolDefinitions,
  kasbAgentToolNames,
} from "./agent-tools.ts";

describe("agent-native KASB tool definitions", () => {
  test("exposes namespaced tool names over stable internal operations", () => {
    expect(kasbAgentToolNames).toEqual([
      "kasb_search_standards",
      "kasb_get_standard_structure",
      "kasb_get_section",
      "kasb_get_paragraph",
      "kasb_search_qna",
      "kasb_get_qna",
    ]);

    expect(defaultKasbAgentTools.map((tool) => tool.operationName)).toEqual([
      "search-standards",
      "get-standard-structure",
      "get-section",
      "get-paragraph",
      "search-qna",
      "get-qna",
    ]);
  });

  test("uses capability schemas as typed tool parameters and result contracts", () => {
    const searchStandards = getKasbAgentTool("kasb_search_standards").definition.function;
    const structure = getKasbAgentTool("kasb_get_standard_structure").definition.function;
    const section = getKasbAgentTool("kasb_get_section").definition.function;
    const paragraph = getKasbAgentTool("kasb_get_paragraph").definition.function;
    const searchQna = getKasbAgentTool("kasb_search_qna").definition.function;
    const qna = getKasbAgentTool("kasb_get_qna").definition.function;

    expect(searchStandards.parameters).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["keyword"],
    });
    expect(structure.parameters).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["stdNum"],
    });
    expect(section.parameters).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["stdNum"],
    });
    expect(paragraph.parameters).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["stdNum", "paraNum"],
    });
    expect(searchQna.parameters).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["keyword"],
    });
    expect(qna.parameters).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["docNumber"],
    });

    expect(getKasbAgentTool("kasb_get_section").resultJsonSchema).toMatchObject({
      type: "object",
      required: ["result", "metadata", "references", "warnings"],
    });
  });

  test("publishes function tool definitions", () => {
    expect(kasbAgentToolDefinitions).toHaveLength(6);
    expect(kasbAgentToolDefinitions.map((tool) => tool.type)).toEqual([
      "function",
      "function",
      "function",
      "function",
      "function",
      "function",
    ]);
    expect(kasbAgentToolDefinitions.map((tool) => tool.function.name)).toEqual([
      ...kasbAgentToolNames,
    ]);
    expect(kasbAgentToolDefinitions.every((tool) => tool.function.description.length > 0)).toBe(
      true,
    );
  });

  test("recognizes only the exposed KASB tool namespace", () => {
    expect(isKasbAgentToolName("kasb_search_standards")).toBe(true);
    expect(isKasbAgentToolName("search-standards")).toBe(false);
    expect(isKasbAgentToolName("darty_search_standards")).toBe(false);
  });
});
