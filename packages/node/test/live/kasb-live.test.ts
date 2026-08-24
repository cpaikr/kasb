import { describe, expect, test } from "bun:test";

import {
  getParagraph,
  getSection,
  getStandardStructure,
  searchStandards,
} from "../../dist/index.js";

const liveTest = process.env.LIVE_KASB_TESTS === "1" ? test : test.skip;

describe("live KASB API checks", () => {
  liveTest("replays the v1 standards traversal", async () => {
    const search = await searchStandards({ keyword: "리스", limit: 100 });
    expect(search.result.standards.some((item) => item.stdNum === "1116")).toBe(true);

    const structure = await getStandardStructure({ stdNum: "1116" });
    expect(structure.result.sections.some((item) => item.indexDocumentId === "ZB2hJW")).toBe(true);

    const section = await getSection({ stdNum: "1116", indexDocumentId: "ZB2hJW" });
    expect(section.result.clauses.map((clause) => clause.paraNum)).toContain("1");

    const paragraph = await getParagraph({ stdNum: "1116", paraNum: "23" });
    expect(paragraph.result.paragraph.uniqueKey).toBe("1116-23");
  });
});
