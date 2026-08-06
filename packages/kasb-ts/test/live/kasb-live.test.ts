import { describe, expect, test } from "bun:test";

import { defaultGetParagraphOperation } from "../../src/app/get-paragraph.ts";
import { defaultGetSectionOperation } from "../../src/app/get-section.ts";
import { defaultGetStandardStructureOperation } from "../../src/app/get-standard-structure.ts";
import { defaultSearchStandardsOperation } from "../../src/app/search-standards.ts";

const liveTest = process.env.LIVE_KASB_TESTS === "1" ? test : test.skip;

describe("live KASB API checks", () => {
  liveTest("replays the v1 standards traversal", async () => {
    const search = await defaultSearchStandardsOperation.execute({ keyword: "리스", limit: 100 });
    expect(search.result.standards.some((item) => item.stdNum === "1116")).toBe(true);

    const structure = await defaultGetStandardStructureOperation.execute({ stdNum: "1116" });
    expect(structure.result.sections.some((item) => item.indexDocumentId === "ZB2hJW")).toBe(true);

    const section = await defaultGetSectionOperation.execute({ stdNum: "1116", indexDocumentId: "ZB2hJW" });
    expect(section.result.clauses.map((clause) => clause.paraNum)).toContain("1");

    const paragraph = await defaultGetParagraphOperation.execute({ stdNum: "1116", paraNum: "23" });
    expect(paragraph.result.paragraph.uniqueKey).toBe("1116-23");
  });
});
