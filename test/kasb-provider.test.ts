import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { defaultGetParagraphOperation } from "../src/app/get-paragraph.ts";
import { defaultGetQnaOperation } from "../src/app/get-qna.ts";
import { defaultGetSectionOperation } from "../src/app/get-section.ts";
import { defaultGetStandardStructureOperation } from "../src/app/get-standard-structure.ts";
import { defaultSearchQnasOperation } from "../src/app/search-qnas.ts";
import { defaultSearchStandardsOperation } from "../src/app/search-standards.ts";
import { KasbFailure } from "../src/capabilities/types.ts";

const repoRoot = join(import.meta.dir, "..");
const originalFetch = globalThis.fetch;

const readFixture = (path: string): unknown =>
  JSON.parse(readFileSync(join(repoRoot, path), "utf8"));

const fixtureByPath = new Map<string, unknown>([
  ["/api/standard?searchWord=%EB%A6%AC%EC%8A%A4", readFixture("fixtures/kasb/search-standards-lease.json")],
  ["/api/standard-indexes/1116", readFixture("fixtures/kasb/standard-indexes-1116.json")],
  ["/api/paragraphs/1116/ZB2hJW", readFixture("fixtures/kasb/section-1116-ZB2hJW.json")],
  ["/api/paragraphs/content/1116/23", readFixture("fixtures/kasb/paragraph-1116-23.json")],
  ["/api/qnas/v2?types=11%2C12%2C13%2C14%2C15%2C24%2C25&searchWord=%EB%A6%AC%EC%8A%A4&page=1&rows=5", readFixture("fixtures/kasb/search-qnas-lease.json")],
  ["/api/qnas/v2/SSI-35629", readFixture("fixtures/kasb/qna-SSI-35629.json")],
  ["/api/paragraphs/1116/19970f", { status: 200, clauses: [], mainTitle: null }],
]);

beforeEach(() => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const key = `${url.pathname}${url.search}`;
    const payload = fixtureByPath.get(key);
    if (payload === undefined) {
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }
    return { ok: true, status: 200, json: async () => payload } as Response;
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("KASB provider operations", () => {
  test("searches standards from the captured standard fixture", async () => {
    const result = await defaultSearchStandardsOperation.execute({ keyword: "리스", limit: 2 });

    expect(result.result.totalMatchCount).toBe(1043);
    expect(result.result.returnedCount).toBe(2);
    expect(result.result.standards[0]?.stdNum).toBe("1017");
    expect(result.warnings[0]?.code).toBe("truncated_results");
  });

  test("returns section identifiers from the captured structure fixture", async () => {
    const result = await defaultGetStandardStructureOperation.execute({ stdNum: "1116" });
    const purpose = result.result.sections.find((item) => item.indexDocumentId === "ZB2hJW");

    expect(result.result.returnedCount).toBe(248);
    expect(purpose?.title).toBe("목적");
    expect(purpose?.ref).toBe("1~2");
  });

  test("fetches a section by indexDocumentId", async () => {
    const result = await defaultGetSectionOperation.execute({
      stdNum: "1116",
      indexDocumentId: "ZB2hJW",
    });

    expect(result.result.section.title).toBe("목적");
    expect(result.result.clauses.map((clause) => clause.paraNum)).toEqual(["1", "2"]);
    expect(result.warnings.map((warning) => warning.code)).toContain("source_html_preserved");
  });

  test("rejects a route-facing titleDocumentId that is not a section id", async () => {
    await expect(
      defaultGetSectionOperation.execute({ stdNum: "1116", indexDocumentId: "19970f" }),
    ).rejects.toMatchObject({ code: "not_found" } satisfies Partial<KasbFailure>);
  });

  test("fetches an exact paragraph by stdNum and paraNum", async () => {
    const result = await defaultGetParagraphOperation.execute({ stdNum: "1116", paraNum: "23" });

    expect(result.result.paragraph.uniqueKey).toBe("1116-23");
    expect(result.result.paragraph.indexDocumentId).toBe("bdbwhT");
    expect(result.result.paragraph.fullContent).toContain("사용권자산을 원가로 측정");
  });

  test("searches Q&A documents from the qnas fixture", async () => {
    const result = await defaultSearchQnasOperation.execute({ keyword: "리스", rows: 5 });

    expect(result.result.returnedCount).toBe(5);
    expect(result.result.items[0]?.docNumber).toBe("IFRSIC2207E");
    expect(result.result.countByType["15"]).toBe(73);
  });

  test("fetches a Q&A document by docNumber", async () => {
    const result = await defaultGetQnaOperation.execute({ docNumber: "SSI-35629" });

    expect(result.result.qna.docNumber).toBe("SSI-35629");
    expect(result.result.qna.tags).toEqual(["리스부채", "리스개시일", "계약일"]);
    expect(result.result.qna.title).toBe("리스 개시일과 계약일");
  });
});
