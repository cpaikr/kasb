import {
  defaultGetParagraphOperation,
  defaultGetQnaOperation,
  defaultGetSectionOperation,
  defaultGetStandardStructureOperation,
  defaultSearchQnaOperation,
  defaultSearchStandardsOperation,
} from "../packages/node/src/default-operations.ts";
import type { KasbAppOperation, KasbAppOperations } from "./typed-tools.ts";

const withFixtureExecution = (
  operation: KasbAppOperation,
  execute: KasbAppOperation["execute"],
): KasbAppOperation => ({ ...operation, execute });

const metadata = {
  fetchedAt: "2026-05-18T00:00:00.000Z",
  source: { system: "kasb", endpoint: "https://db.kasb.or.kr/api/fixture" },
  sourceBehavior: { observationStatus: "observed", apiBase: "https://db.kasb.or.kr/api" },
  completeness: "complete",
};

export const fixtureKasbAppOperations: KasbAppOperations = {
  searchStandards: withFixtureExecution(defaultSearchStandardsOperation, async (input) => ({
    result: {
      request: input,
      returnedCount: 1,
      totalMatchCount: 1,
      totalStandardCount: 1,
      suggestedKeywords: [],
      standards: [{
        stdNum: "1116",
        matchCount: 1,
        references: { apiUrl: "https://example.test/1116" },
        nextActions: {
          getStandardStructure: {
            operation: "get-standard-structure",
            input: { stdNum: "1116" },
          },
        },
      }],
    },
    metadata,
    references: { searchUrl: "https://example.test/standard" },
    warnings: [],
  })),
  getStandardStructure: withFixtureExecution(defaultGetStandardStructureOperation, async (input) => ({
    result: {
      request: input,
      returnedCount: 1,
      sections: [{
        stdNum: "1116",
        indexDocumentId: "ZB2hJW",
        title: "목적",
        ref: "1~2",
        level: 1,
        parentDocumentIds: [],
      }],
    },
    metadata,
    references: { stdNum: "1116", structureUrl: "https://example.test/structure" },
    warnings: [],
  })),
  getSection: withFixtureExecution(defaultGetSectionOperation, async (input) => {
    if (input.indexDocumentId === "19970f") {
      throw Object.assign(new Error(
        "No section matched this browser titleDocumentId. Use get-standard-structure and retry with indexDocumentId.",
      ), { code: "not_found", retryable: false });
    }
    return {
      result: {
        request: input,
        section: { stdNum: "1116", indexDocumentId: "ZB2hJW", title: "목적" },
        clauses: [
          { kind: "paragraph", stdNum: "1116", indexDocumentId: "ZB2hJW", paraNum: "1" },
          { kind: "paragraph", stdNum: "1116", indexDocumentId: "ZB2hJW", paraNum: "2" },
        ],
      },
      metadata,
      references: {
        stdNum: "1116",
        indexDocumentId: "ZB2hJW",
        sectionUrl: "https://example.test/section",
      },
      warnings: [],
    };
  }),
  getParagraph: withFixtureExecution(defaultGetParagraphOperation, async (input) => {
    const paraNum = String(input.paraNum);
    return {
      result: {
        request: input,
        paragraph: {
          stdNum: "1116",
          paraNum,
          uniqueKey: `1116-${paraNum}`,
          indexDocumentId: "ZB2hJW",
          paraContent: "fixture",
          fullContent: "fixture",
        },
      },
      metadata,
      references: {
        stdNum: "1116",
        paraNum,
        uniqueKey: `1116-${paraNum}`,
        indexDocumentId: "ZB2hJW",
        paragraphUrl: `https://example.test/paragraph/${paraNum}`,
      },
      warnings: [],
    };
  }),
  searchQna: withFixtureExecution(defaultSearchQnaOperation, async (input) => ({
    result: {
      request: input,
      items: [{
        docNumber: "SSI-35629",
        title: "리스 질의",
        type: 15,
        typeLabel: "fixture",
        snippet: "fixture",
        tags: [],
        deprecated: false,
        references: { qnaUrl: "https://example.test/qna/SSI-35629" },
      }],
      returnedCount: 1,
      totalCount: 1,
      totalPages: 1,
      hasNextPage: false,
      paginationStatus: "known",
      countByType: { "15": 1 },
      typeLabels: { "15": "fixture" },
      suggestedKeywords: [],
    },
    metadata,
    references: { searchUrl: "https://example.test/qna" },
    warnings: [],
  })),
  getQna: withFixtureExecution(defaultGetQnaOperation, async (input) => ({
    result: {
      request: input,
      qna: {
        docNumber: "SSI-35629",
        type: 15,
        typeLabel: "fixture",
        title: "리스 개시일과 계약일",
        fullContent: "fixture",
        tags: [],
        deprecated: false,
      },
    },
    metadata,
    references: { docNumber: "SSI-35629", qnaUrl: "https://example.test/qna/SSI-35629" },
    warnings: [],
  })),
};
