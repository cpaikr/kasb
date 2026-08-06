import { describe, expect, test } from "bun:test";

import { resolveGetParagraphRequest } from "../../src/capabilities/get-paragraph/contract.ts";
import { resolveGetQnaRequest } from "../../src/capabilities/get-qna/contract.ts";
import { resolveGetSectionRequest } from "../../src/capabilities/get-section/contract.ts";
import { resolveGetStandardStructureRequest } from "../../src/capabilities/get-standard-structure/contract.ts";
import { resolveSearchQnaRequest } from "../../src/capabilities/search-qna/contract.ts";
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
      { parameter: "input", messageIncludes: "object" },
    );
    expectInvalid(
      () => resolveSearchStandardsRequest([] as unknown as Record<string, unknown>),
      { parameter: "input", messageIncludes: "object" },
    );
  });

  test("rejects unknown keys", () => {
    expectInvalid(
      () => resolveGetParagraphRequest({ stdNum: "1116", paraNum: "23", extra: true }),
      { parameter: "extra", messageIncludes: "Unknown parameter" },
    );
  });

  test("suggests typed JSON field names for common invalid parameter patterns", () => {
    expectInvalid(
      () => resolveGetParagraphRequest({ "std-num": "1116", "para-num": "23" }),
      { parameter: "std-num", messageIncludes: "stdNum" },
    );
    expectInvalid(
      () => resolveSearchStandardsRequest({ searchWord: "리스" }),
      { parameter: "searchWord", messageIncludes: "keyword" },
    );
    expectInvalid(
      () => resolveSearchQnaRequest({ query: "리스" }),
      { parameter: "query", messageIncludes: "keyword" },
    );
    expectInvalid(
      () => resolveSearchQnaRequest({ keyword: "리스", limit: 5 }),
      { parameter: "limit", messageIncludes: "rows" },
    );
    expectInvalid(
      () => resolveGetSectionRequest({ stdNum: "1116", titleDocumentId: "19970f" }),
      { parameter: "titleDocumentId", messageIncludes: "browser-route id" },
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
    { name: "get-paragraph", resolver: resolveGetParagraphRequest as Resolver<unknown>, parameter: "paraNum", base: { stdNum: "1116" } },
    { name: "search-qna", resolver: resolveSearchQnaRequest as Resolver<unknown>, parameter: "keyword" },
    { name: "get-qna", resolver: resolveGetQnaRequest as Resolver<unknown>, parameter: "docNumber" },
  ];

  for (const { name, resolver, parameter, base = {} } of requiredStringCases) {
    test(`${name} rejects blank required string ${parameter}`, () => {
      expectInvalid(
        () => resolver({ ...base, [parameter]: "   " }),
        { parameter, messageIncludes: "cannot be blank" },
      );
    });
  }

  test("requires get-section to receive exactly one section locator", () => {
    expectInvalid(
      () => resolveGetSectionRequest({ stdNum: "1116" }),
      { parameter: "indexDocumentId", messageIncludes: "titleDocumentId" },
    );
    expectInvalid(
      () => resolveGetSectionRequest({ stdNum: "1116", indexDocumentId: "ZB2hJW", ref: "1~2" }),
      { parameter: "ref", messageIncludes: "exactly one" },
    );
  });

  test("trims required strings and omits blank optional strings", () => {
    expect(resolveGetSectionRequest({ stdNum: " 1116 ", indexDocumentId: " ZB2hJW ", keyword: " " })).toEqual({
      stdNum: "1116",
      indexDocumentId: "ZB2hJW",
    });
    expect(resolveGetSectionRequest({ stdNum: " 1116 ", ref: " 1~2 " })).toEqual({
      stdNum: "1116",
      ref: "1~2",
    });
    expect(resolveGetQnaRequest({ docNumber: " SSI-35629 ", keyword: " 리스 " })).toEqual({
      docNumber: "SSI-35629",
      keyword: "리스",
    });
  });

  test("applies request defaults", () => {
    expect(resolveSearchStandardsRequest({ keyword: "리스" })).toMatchObject({ limit: 20, sort: "relevance" });
    expect(resolveSearchQnaRequest({ keyword: "리스" })).toMatchObject({ page: 1, rows: 10 });
  });

  test("normalizes Q&A recency controls", () => {
    expect(resolveSearchQnaRequest({ keyword: "리스", sortDate: "desc", from: "2024-01-01", to: "2024-12-31" })).toMatchObject({
      sortDate: "desc",
      from: "2024-01-01",
      to: "2024-12-31",
    });
  });

  test("rejects unsupported search-standards sort modes", () => {
    expectInvalid(
      () => resolveSearchStandardsRequest({ keyword: "리스", sort: "source" } as Record<string, unknown>),
      { parameter: "sort", messageIncludes: "relevance, match-count, std-num, title" },
    );
  });

  test("normalizes source-facing Q&A type CSV", () => {
    expect(resolveSearchQnaRequest({ keyword: "리스", types: " 24, 25 " }).types).toBe("24,25");
  });

  test("rejects malformed source-facing Q&A type CSV", () => {
    expectInvalid(
      () => resolveSearchQnaRequest({ keyword: "리스", types: "24,,25" }),
      { parameter: "types", messageIncludes: "CSV of numeric Q&A type ids" },
    );
  });

  test.each([
    ["sortDate", () => resolveSearchQnaRequest({ keyword: "리스", sortDate: "recent" } as Record<string, unknown>), "sortDate", "asc or desc"],
    ["from", () => resolveSearchQnaRequest({ keyword: "리스", from: "2024-99-01" }), "from", "YYYY-MM-DD"],
    ["to before from", () => resolveSearchQnaRequest({ keyword: "리스", from: "2024-12-31", to: "2024-01-01" }), "to", "from"],
  ] as const)("rejects invalid Q&A recency control %s", (_name, run, parameter, messageIncludes) => {
    expectInvalid(run, { parameter, messageIncludes });
  });

  test("rejects paragraph ranges with a get-section recovery hint", () => {
    expectInvalid(
      () => resolveGetParagraphRequest({ stdNum: "1116", paraNum: "22~30" }),
      { parameter: "paraNum", messageIncludes: "get-section ref" },
    );
  });

  test.each([
    ["stdNum", { stdNum: "..", paraNum: "23" }],
    ["paraNum", { stdNum: "1116", paraNum: "." }],
    ["stdNum", { stdNum: " . ", paraNum: "23" }],
    ["paraNum", { stdNum: "1116", paraNum: "\u{FEFF}..\u{3000}" }],
  ] as const)("rejects URL dot segment %s identifiers", (parameter, input) => {
    expectInvalid(
      () => resolveGetParagraphRequest(input),
      { parameter, messageIncludes: "cannot be a URL dot segment" },
    );
  });

  test("preserves embedded line terminators in opaque paragraph identifiers", () => {
    expect(resolveGetParagraphRequest({ stdNum: "11\n16", paraNum: "2\n3" })).toEqual({
      stdNum: "11\n16",
      paraNum: "2\n3",
    });
  });

  test("rejects numeric-only Q&A doc numbers with a search-qna recovery hint", () => {
    expectInvalid(
      () => resolveGetQnaRequest({ docNumber: "35629" }),
      { parameter: "docNumber", messageIncludes: "search-qna" },
    );
  });

  test.each([
    ["search-standards limit", () => resolveSearchStandardsRequest({ keyword: "리스", limit: 1.5 }), "limit", "integer"],
    ["search-qna page", () => resolveSearchQnaRequest({ keyword: "리스", page: 0 }), "page", "between 1 and 1000"],
    ["search-qna rows", () => resolveSearchQnaRequest({ keyword: "리스", rows: 51 }), "rows", "between 1 and 50"],
    ["search-qna rows type", () => resolveSearchQnaRequest({ keyword: "리스", rows: "5" } as Record<string, unknown>), "rows", "integer"],
  ] as const)("rejects invalid integer %s", (_name, run, parameter, messageIncludes) => {
    expectInvalid(run, { parameter, messageIncludes });
  });
});
