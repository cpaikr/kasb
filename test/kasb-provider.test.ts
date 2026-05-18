import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { defaultGetParagraphOperation } from "../src/app/get-paragraph.ts";
import { defaultGetQnaOperation } from "../src/app/get-qna.ts";
import { defaultGetSectionOperation } from "../src/app/get-section.ts";
import { defaultGetStandardStructureOperation } from "../src/app/get-standard-structure.ts";
import { defaultSearchQnaOperation } from "../src/app/search-qna.ts";
import { defaultSearchStandardsOperation } from "../src/app/search-standards.ts";
import { KasbFailure } from "../src/capabilities/types.ts";

const repoRoot = join(import.meta.dir, "..");
const originalFetch = globalThis.fetch;

const readFixture = (path: string): unknown =>
  JSON.parse(readFileSync(join(repoRoot, path), "utf8"));

const makeFixtureMap = (): Map<string, unknown> => new Map([
  ["/api/standard?searchWord=%EB%A6%AC%EC%8A%A4", readFixture("fixtures/kasb/search-standards-lease.json")],
  ["/api/standard-indexes/1116", readFixture("fixtures/kasb/standard-indexes-1116.json")],
  ["/api/standard-indexes/1116/searchWord?searchWord=%EB%A6%AC%EC%8A%A4", readFixture("fixtures/kasb/standard-indexes-1116-search-lease.json")],
  ["/api/paragraphs/1116/ZB2hJW", readFixture("fixtures/kasb/section-1116-ZB2hJW.json")],
  ["/api/paragraphs/content/1116/23", readFixture("fixtures/kasb/paragraph-1116-23.json")],
  ["/api/qnas/v2?types=11%2C12%2C13%2C14%2C15%2C24%2C25&searchWord=%EB%A6%AC%EC%8A%A4&page=1&rows=5", readFixture("fixtures/kasb/search-qna-lease.json")],
  ["/api/qnas/v2/SSI-35629", readFixture("fixtures/kasb/qna-SSI-35629.json")],
  ["/api/paragraphs/1116/19970f", { status: 200, clauses: [], mainTitle: null }],
]);

const clone = <T>(value: T): T => structuredClone(value);

const useFixtureMap = (fixtureByPath: Map<string, unknown>): void => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const key = `${url.pathname}${url.search}`;
    const payload = fixtureByPath.get(key);
    if (payload === undefined) {
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }
    return { ok: true, status: 200, json: async () => payload } as Response;
  }) as typeof fetch;
};

beforeEach(() => {
  useFixtureMap(makeFixtureMap());
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

  test("enriches standard search rows with available titles", async () => {
    const fixtures = makeFixtureMap();
    fixtures.set("/api/standard?searchWord=%EB%A6%AC%EC%8A%A4", {
      standards: { totalCount: 519, stdCountArr: [{ key: "1116", doc_count: 519 }] },
    });
    useFixtureMap(fixtures);

    const result = await defaultSearchStandardsOperation.execute({ keyword: "리스", limit: 1 });

    expect(result.result.standards[0]).toMatchObject({
      stdNum: "1116",
      standardTitle: "기업회계기준서 제1116호 리스",
      standardKind: "k-ifrs-standard",
    });
  });

  test("suggests broader standard keywords for narrow terms", async () => {
    const fixtures = makeFixtureMap();
    fixtures.set(`/api/standard?searchWord=${encodeURIComponent("장기종업원급여")}`, {
      standards: { totalCount: 0, stdCountArr: [] },
    });
    useFixtureMap(fixtures);

    const result = await defaultSearchStandardsOperation.execute({ keyword: "장기종업원급여" });

    expect(result.result.suggestedKeywords).toContain("종업원급여");
  });

  test("returns section identifiers from the captured structure fixture", async () => {
    const result = await defaultGetStandardStructureOperation.execute({ stdNum: "1116" });
    const purpose = result.result.sections.find((item) => item.indexDocumentId === "ZB2hJW");

    expect(result.result.returnedCount).toBe(248);
    expect(purpose?.title).toBe("목적");
    expect(purpose?.ref).toBe("1~2");
  });

  test("filters standard structure with keyword search metadata", async () => {
    const result = await defaultGetStandardStructureOperation.execute({ stdNum: "1116", keyword: "리스" });

    expect(result.result.returnedCount).toBe(2);
    expect(result.result.sections.map((section) => section.indexDocumentId)).toEqual(["ZB2hJW", "fgc8eT"]);
    expect(result.references.structureUrl).toBe("https://db.kasb.or.kr/api/standard-indexes/1116/searchWord?searchWord=%EB%A6%AC%EC%8A%A4");
    expect(result.warnings.map((warning) => warning.code)).toContain("search_filtered_structure");
  });

  test("returns empty filtered structure results when keyword metadata has no hits", async () => {
    const fixtures = makeFixtureMap();
    fixtures.set(
      `/api/standard-indexes/1116/searchWord?searchWord=${encodeURIComponent("없는단어")}`,
      readFixture("fixtures/kasb/standard-indexes-1116-search-empty.json"),
    );
    useFixtureMap(fixtures);

    const result = await defaultGetStandardStructureOperation.execute({ stdNum: "1116", keyword: "없는단어" });

    expect(result.result.returnedCount).toBe(0);
    expect(result.result.sections).toEqual([]);
    expect(result.warnings.map((warning) => warning.code)).toContain("search_filtered_structure");
  });

  test("rejects keyword structure metadata with unknown section ids", async () => {
    const fixtures = makeFixtureMap();
    fixtures.set("/api/standard-indexes/1116/searchWord?searchWord=%EB%A6%AC%EC%8A%A4", {
      searchedUniqueKeys: ["1116-1"],
      searchedIndexCountMap: { unknown: 1 },
    });
    useFixtureMap(fixtures);

    await expect(defaultGetStandardStructureOperation.execute({ stdNum: "1116", keyword: "리스" })).rejects.toMatchObject({
      code: "source_changed",
    } satisfies Partial<KasbFailure>);
  });

  test("fetches a section by indexDocumentId", async () => {
    const result = await defaultGetSectionOperation.execute({
      stdNum: "1116",
      indexDocumentId: "ZB2hJW",
    });

    expect(result.result.section.title).toBe("목적");
    expect(result.result.clauses.map((clause) => clause.paraNum)).toEqual(["1", "2"]);
    expect(result.warnings.map((warning) => warning.code)).not.toContain("source_html_preserved");
    expect(result.metadata.content?.htmlFields).toContain("result.clauses[].paraContent");
  });

  test("fetches a section by structure ref", async () => {
    const result = await defaultGetSectionOperation.execute({
      stdNum: "1116",
      ref: "1~2",
    });

    expect(result.result.section).toMatchObject({
      indexDocumentId: "ZB2hJW",
      ref: "1~2",
      title: "목적",
    });
    expect(result.references.indexDocumentId).toBe("ZB2hJW");
    expect(result.result.clauses.map((clause) => clause.paraNum)).toEqual(["1", "2"]);
  });

  test("rejects a route-facing titleDocumentId that is not a section id", async () => {
    await expect(
      defaultGetSectionOperation.execute({ stdNum: "1116", indexDocumentId: "19970f" }),
    ).rejects.toMatchObject({
      code: "not_found",
      message: expect.stringContaining("titleDocumentId"),
    });
  });

  test("fetches an exact paragraph by stdNum and paraNum", async () => {
    const result = await defaultGetParagraphOperation.execute({ stdNum: "1116", paraNum: "23" });

    expect(result.result.paragraph.uniqueKey).toBe("1116-23");
    expect(result.result.paragraph.indexDocumentId).toBe("bdbwhT");
    expect(result.result.paragraph.fullContent).toContain("사용권자산을 원가로 측정");
  });

  test("searches Q&A documents from the qnas fixture", async () => {
    const result = await defaultSearchQnaOperation.execute({ keyword: "리스", rows: 5 });

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

  test("classifies 200 OK non-JSON source responses as source_changed", async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    }) as unknown as Response) as unknown as typeof fetch;

    await expect(defaultSearchStandardsOperation.execute({ keyword: "리스" })).rejects.toMatchObject({
      code: "source_changed",
      retryable: false,
    } satisfies Partial<KasbFailure>);
  });

  test("classifies body-read failures as source_unavailable", async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("Body stream interrupted");
      },
    }) as unknown as Response) as unknown as typeof fetch;

    await expect(defaultSearchStandardsOperation.execute({ keyword: "리스" })).rejects.toMatchObject({
      code: "source_unavailable",
      retryable: true,
    } satisfies Partial<KasbFailure>);
  });

  test("rejects all-malformed standards search rows as source_changed", async () => {
    const fixtures = makeFixtureMap();
    fixtures.set("/api/standard?searchWord=%EB%A6%AC%EC%8A%A4", {
      standards: { totalCount: 1, stdCountArr: [{ bad: true }] },
    });
    useFixtureMap(fixtures);

    await expect(defaultSearchStandardsOperation.execute({ keyword: "리스" })).rejects.toMatchObject({
      code: "source_changed",
    } satisfies Partial<KasbFailure>);
  });

  test("rejects all-malformed standard structure rows as source_changed", async () => {
    const fixtures = makeFixtureMap();
    fixtures.set("/api/standard-indexes/1116", {
      standardIndexes: [{ documentId: "ZB2hJW", stdNum: "1116" }],
    });
    useFixtureMap(fixtures);

    await expect(defaultGetStandardStructureOperation.execute({ stdNum: "1116" })).rejects.toMatchObject({
      code: "source_changed",
    } satisfies Partial<KasbFailure>);
  });

  test("marks partially malformed structure rows as partial with a warning", async () => {
    const fixtures = makeFixtureMap();
    const structure = clone(readFixture("fixtures/kasb/standard-indexes-1116.json")) as {
      standardIndexes: unknown[];
    };
    structure.standardIndexes = [structure.standardIndexes[0], { documentId: "bad", stdNum: "1116" }];
    fixtures.set("/api/standard-indexes/1116", structure);
    useFixtureMap(fixtures);

    const result = await defaultGetStandardStructureOperation.execute({ stdNum: "1116" });

    expect(result.metadata.completeness).toBe("partial");
    expect(result.warnings.map((warning) => warning.code)).toContain("source_metadata_incomplete");
  });

  test("allows parent section responses to include child clause document ids and titles", async () => {
    const fixtures = makeFixtureMap();
    const section = clone(readFixture("fixtures/kasb/section-1116-ZB2hJW.json")) as {
      clauses: Array<Record<string, unknown>>;
      mainTitle?: string;
    };
    section.mainTitle = "기업회계기준서 제1116호 리스";
    section.clauses = [
      {
        documentId: "ZB2hJW",
        stdNum: 1116,
        level: 2,
        title: "목적",
        ref: "1~2",
        sort: 40,
        type: "title",
      },
      ...section.clauses,
    ];
    fixtures.set("/api/paragraphs/1116/2MIunt", section);
    useFixtureMap(fixtures);

    const result = await defaultGetSectionOperation.execute({ stdNum: "1116", indexDocumentId: "2MIunt" });

    expect(result.result.section.indexDocumentId).toBe("2MIunt");
    expect(result.result.clauses[0]).toMatchObject({
      kind: "title",
      indexDocumentId: "ZB2hJW",
      title: "목적",
    });
  });

  test.each([
    ["null rows", [null]],
    ["shapeless object rows", [{ bad: true }]],
  ] as const)("rejects all-malformed section clause %s as source_changed", (_label, clauses) => {
    const fixtures = makeFixtureMap();
    fixtures.set("/api/paragraphs/1116/ZB2hJW", {
      clauses,
      mainTitle: "목적",
      mainTitleLevel: 2,
    });
    useFixtureMap(fixtures);

    return expect(
      defaultGetSectionOperation.execute({ stdNum: "1116", indexDocumentId: "ZB2hJW" }),
    ).rejects.toMatchObject({ code: "source_changed" } satisfies Partial<KasbFailure>);
  });

  test("rejects mismatched paragraph identity as source_changed", async () => {
    const fixtures = makeFixtureMap();
    const paragraph = clone(readFixture("fixtures/kasb/paragraph-1116-23.json")) as {
      paraContents: Array<Record<string, unknown>>;
    };
    paragraph.paraContents[0] = { ...paragraph.paraContents[0], paraNum: "24", uniqueKey: "1116-24" };
    fixtures.set("/api/paragraphs/content/1116/23", paragraph);
    useFixtureMap(fixtures);

    await expect(defaultGetParagraphOperation.execute({ stdNum: "1116", paraNum: "23" })).rejects.toMatchObject({
      code: "source_changed",
    } satisfies Partial<KasbFailure>);
  });

  test("rejects all-malformed Q&A search rows as source_changed", async () => {
    const fixtures = makeFixtureMap();
    fixtures.set("/api/qnas/v2?types=11%2C12%2C13%2C14%2C15%2C24%2C25&searchWord=%EB%A6%AC%EC%8A%A4&page=1&rows=5", {
      facilityQnas: [{ docNumber: "SSI-1" }],
      facilityQnaCountData: {},
    });
    useFixtureMap(fixtures);

    await expect(defaultSearchQnaOperation.execute({ keyword: "리스", rows: 5 })).rejects.toMatchObject({
      code: "source_changed",
    } satisfies Partial<KasbFailure>);
  });

  test("rejects mismatched Q&A detail identity as source_changed", async () => {
    const fixtures = makeFixtureMap();
    const qna = clone(readFixture("fixtures/kasb/qna-SSI-35629.json")) as {
      facilityQna: Record<string, unknown>;
    };
    qna.facilityQna = { ...qna.facilityQna, docNumber: "SSI-OTHER" };
    fixtures.set("/api/qnas/v2/SSI-35629", qna);
    useFixtureMap(fixtures);

    await expect(defaultGetQnaOperation.execute({ docNumber: "SSI-35629" })).rejects.toMatchObject({
      code: "source_changed",
    } satisfies Partial<KasbFailure>);
  });
});
