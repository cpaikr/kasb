import { describe, expect, test } from "bun:test";

import { resolveGetParagraphRequest } from "../../src/capabilities/get-paragraph/contract.ts";
import { resolveGetQnaRequest } from "../../src/capabilities/get-qna/contract.ts";
import { resolveGetSectionRequest } from "../../src/capabilities/get-section/contract.ts";
import { resolveGetStandardStructureRequest } from "../../src/capabilities/get-standard-structure/contract.ts";
import { resolveSearchQnasRequest } from "../../src/capabilities/search-qnas/contract.ts";
import { resolveSearchStandardsRequest } from "../../src/capabilities/search-standards/contract.ts";
import { InvalidCapabilityRequest } from "../../src/capabilities/types.ts";

type Resolver<T> = (input: Record<string, unknown>) => T;

const expectInvalid = (
  run: () => unknown,
  expected: { readonly parameter: string; readonly messageIncludes: string },
): void => {
  try {
    run();
    throw new Error("Expected invalid request.");
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidCapabilityRequest);
    expect((error as InvalidCapabilityRequest).parameter).toBe(expected.parameter);
    expect((error as InvalidCapabilityRequest).message).toContain(expected.messageIncludes);
  }
};

describe("capability request validation", () => {
  test("rejects non-object input", () => {
    expectInvalid(
      () => resolveSearchStandardsRequest(null as unknown as Record<string, unknown>),
      { parameter: "input", messageIncludes: "객체" },
    );
    expectInvalid(
      () => resolveSearchStandardsRequest([] as unknown as Record<string, unknown>),
      { parameter: "input", messageIncludes: "객체" },
    );
  });

  test("rejects unknown keys", () => {
    expectInvalid(
      () => resolveGetParagraphRequest({ stdNum: "1116", paraNum: "23", extra: true }),
      { parameter: "extra", messageIncludes: "알 수 없는" },
    );
  });

  const requiredStringCases: readonly {
    readonly name: string;
    readonly resolver: Resolver<unknown>;
    readonly parameter: string;
    readonly base?: Record<string, unknown>;
  }[] = [
    { name: "search-standards", resolver: resolveSearchStandardsRequest as Resolver<unknown>, parameter: "keyword" },
    { name: "get-standard-structure", resolver: resolveGetStandardStructureRequest as Resolver<unknown>, parameter: "stdNum" },
    { name: "get-section", resolver: resolveGetSectionRequest as Resolver<unknown>, parameter: "indexDocumentId", base: { stdNum: "1116" } },
    { name: "get-paragraph", resolver: resolveGetParagraphRequest as Resolver<unknown>, parameter: "paraNum", base: { stdNum: "1116" } },
    { name: "search-qnas", resolver: resolveSearchQnasRequest as Resolver<unknown>, parameter: "keyword" },
    { name: "get-qna", resolver: resolveGetQnaRequest as Resolver<unknown>, parameter: "docNumber" },
  ];

  for (const { name, resolver, parameter, base = {} } of requiredStringCases) {
    test(`${name} rejects blank required string ${parameter}`, () => {
      expectInvalid(
        () => resolver({ ...base, [parameter]: "   " }),
        { parameter, messageIncludes: "빈 문자열" },
      );
    });
  }

  test("trims required strings and omits blank optional strings", () => {
    expect(resolveGetSectionRequest({ stdNum: " 1116 ", indexDocumentId: " ZB2hJW ", keyword: " " })).toEqual({
      stdNum: "1116",
      indexDocumentId: "ZB2hJW",
    });
    expect(resolveGetQnaRequest({ docNumber: " SSI-35629 ", keyword: " 리스 " })).toEqual({
      docNumber: "SSI-35629",
      keyword: "리스",
    });
  });

  test("applies integer defaults", () => {
    expect(resolveSearchStandardsRequest({ keyword: "리스" }).limit).toBe(20);
    expect(resolveSearchQnasRequest({ keyword: "리스" })).toMatchObject({ page: 1, rows: 10 });
  });

  test.each([
    ["search-standards limit", () => resolveSearchStandardsRequest({ keyword: "리스", limit: 1.5 }), "limit", "정수"],
    ["search-qnas page", () => resolveSearchQnasRequest({ keyword: "리스", page: 0 }), "page", "1 이상 1000 이하"],
    ["search-qnas rows", () => resolveSearchQnasRequest({ keyword: "리스", rows: 51 }), "rows", "1 이상 50 이하"],
    ["search-qnas rows type", () => resolveSearchQnasRequest({ keyword: "리스", rows: "5" } as Record<string, unknown>), "rows", "정수"],
  ] as const)("rejects invalid integer %s", (_name, run, parameter, messageIncludes) => {
    expectInvalid(run, { parameter, messageIncludes });
  });
});
