import type { GetParagraphProvider } from "../../capabilities/get-paragraph/provider.ts";
import type { Paragraph } from "../../capabilities/get-paragraph/contract.ts";
import type { GetQnaProvider } from "../../capabilities/get-qna/provider.ts";
import type { Qna } from "../../capabilities/get-qna/contract.ts";
import type { GetSectionProvider } from "../../capabilities/get-section/provider.ts";
import type { SectionClause } from "../../capabilities/get-section/contract.ts";
import type { GetStandardStructureProvider } from "../../capabilities/get-standard-structure/provider.ts";
import type { StandardSectionNode } from "../../capabilities/get-standard-structure/contract.ts";
import type { SearchQnasProvider } from "../../capabilities/search-qnas/provider.ts";
import type { QnaSearchItem } from "../../capabilities/search-qnas/contract.ts";
import type { SearchStandardsProvider } from "../../capabilities/search-standards/provider.ts";
import type { SearchStandardItem } from "../../capabilities/search-standards/contract.ts";
import { ProviderFailure, type ResultMetadata } from "../../capabilities/types.ts";
import { fetchKasbJson } from "./fetch-json.ts";
import {
  asArray,
  asRecord,
  optionalNumber,
  optionalString,
  sourceChanged,
  stripHtml,
  toStringValue,
} from "./source-helpers.ts";
import {
  paragraphContentUrl,
  paragraphsUrl,
  qnaContentUrl,
  qnasSearchUrl,
  standardIndexesUrl,
  standardsSearchUrl,
} from "./urls.ts";

const observedSourceBehavior = {
  observationStatus: "observed",
  apiBase: "https://db.kasb.or.kr/api",
} as const;

const metadata = (endpoint: string, completeness: "complete" | "partial" = "complete"): ResultMetadata => ({
  fetchedAt: new Date().toISOString(),
  source: { system: "kasb", endpoint },
  sourceBehavior: observedSourceBehavior,
  completeness,
});

export const kasbSearchStandardsProvider: SearchStandardsProvider = {
  search: (request) => searchStandards(request),
};

export const kasbStandardStructureProvider: GetStandardStructureProvider = {
  getStructure: (request) => getStandardStructure(request),
};

export const kasbSectionProvider: GetSectionProvider = {
  getSection: (request) => getSection(request),
};

export const kasbParagraphProvider: GetParagraphProvider = {
  getParagraph: (request) => getParagraph(request),
};

export const kasbSearchQnasProvider: SearchQnasProvider = {
  search: (request) => searchQnas(request),
};

export const kasbQnaProvider: GetQnaProvider = {
  getQna: (request) => getQna(request),
};

const searchStandards: SearchStandardsProvider["search"] = async (request) => {
  const sourceUrl = standardsSearchUrl(request.keyword);
  const payload = asRecord(await fetchKasbJson(sourceUrl), sourceUrl, "standard search");
  const standards = asRecord(payload.standards, sourceUrl, "standards");
  const stdCountArr = asArray(standards.stdCountArr, sourceUrl, "stdCountArr");
  const totalMatchCount = optionalNumber(standards.totalCount) ?? 0;

  const items = stdCountArr
    .map((item) => toSearchStandardItem(item, sourceUrl))
    .filter((item): item is SearchStandardItem => item !== undefined);
  const limitedItems = items.slice(0, request.limit);

  return {
    result: {
      request,
      totalMatchCount,
      totalStandardCount: items.length,
      returnedCount: limitedItems.length,
      standards: limitedItems,
    },
    metadata: metadata(sourceUrl, items.length === stdCountArr.length ? "complete" : "partial"),
    references: { searchUrl: sourceUrl },
    warnings:
      limitedItems.length < items.length
        ? [{ code: "truncated_results", message: `검색 결과를 ${request.limit}개로 제한했습니다.` }]
        : [],
  };
};

const toSearchStandardItem = (
  value: unknown,
  sourceUrl: string,
): SearchStandardItem | undefined => {
  if (!asSoftRecord(value)) return undefined;
  const stdNum = toStringValue(value.key);
  const matchCount = optionalNumber(value.doc_count);
  if (stdNum === undefined || matchCount === undefined) return undefined;
  return {
    stdNum,
    matchCount,
    references: { apiUrl: standardsSearchUrl(stdNum) === sourceUrl ? sourceUrl : standardIndexesUrl(stdNum) },
  };
};

const getStandardStructure: GetStandardStructureProvider["getStructure"] = async (request) => {
  const sourceUrl = standardIndexesUrl(request.stdNum, request.keyword);
  const payload = asRecord(await fetchKasbJson(sourceUrl), sourceUrl, "standard indexes");
  const sourceItems = asArray(payload.standardIndexes, sourceUrl, "standardIndexes");
  const sections = sourceItems
    .map((item) => toSectionNode(item, sourceUrl))
    .filter((item): item is StandardSectionNode => item !== undefined);

  if (sections.length === 0) {
    throw new ProviderFailure({
      code: "not_found",
      message: `기준서 ${request.stdNum}의 구조를 찾을 수 없습니다.`,
      retryable: false,
      sourceUrl,
    });
  }

  return {
    result: { request, sections, returnedCount: sections.length },
    metadata: metadata(sourceUrl, sections.length === sourceItems.length ? "complete" : "partial"),
    references: { stdNum: request.stdNum, structureUrl: sourceUrl },
    warnings:
      request.keyword === undefined
        ? []
        : [{ code: "search_filtered_structure", message: "keyword가 적용된 구조 결과입니다." }],
  };
};

const toSectionNode = (value: unknown, sourceUrl: string): StandardSectionNode | undefined => {
  if (!asSoftRecord(value)) return undefined;
  const indexDocumentId = toStringValue(value.documentId);
  const stdNum = toStringValue(value.stdNum);
  const title = optionalString(value.title);
  const level = optionalNumber(value.level);
  if (indexDocumentId === undefined || stdNum === undefined || title === undefined || level === undefined) {
    return undefined;
  }
  const parentDocumentIds = Array.isArray(value.parentDocumentIds)
    ? value.parentDocumentIds.map(toStringValue).filter((item): item is string => item !== undefined)
    : [];
  const documentType = optionalString(value.documentType);
  const sort = optionalNumber(value.sort);
  return {
    indexDocumentId,
    stdNum,
    title,
    ref: optionalString(value.ref) ?? "",
    level,
    parentDocumentIds,
    ...(documentType === undefined ? {} : { documentType }),
    ...(sort === undefined ? {} : { sort }),
  };
};

const getSection: GetSectionProvider["getSection"] = async (request) => {
  const sourceUrl = paragraphsUrl(request.stdNum, request.indexDocumentId, request.keyword);
  const payload = asRecord(await fetchKasbJson(sourceUrl), sourceUrl, "paragraphs");
  const sourceClauses = asArray(payload.clauses, sourceUrl, "clauses");
  const clauses = sourceClauses
    .map((item) => toSectionClause(item, sourceUrl, request.stdNum, request.indexDocumentId))
    .filter((item): item is SectionClause => item !== undefined);

  if (clauses.length === 0) {
    const structureUrl = standardIndexesUrl(request.stdNum);
    const structure = asRecord(await fetchKasbJson(structureUrl), structureUrl, "standard indexes");
    const exists = asArray(structure.standardIndexes, structureUrl, "standardIndexes").some((item) =>
      asSoftRecord(item) && toStringValue(item.documentId) === request.indexDocumentId,
    );
    if (!exists) {
      throw new ProviderFailure({
        code: "not_found",
        message: "요청한 indexDocumentId에 해당하는 섹션을 찾을 수 없습니다.",
        retryable: false,
        sourceUrl,
      });
    }
  }

  const level = optionalNumber(payload.mainTitleLevel);
  const sort = optionalNumber(payload.mainTitleSort);
  return {
    result: {
      request,
      section: {
        stdNum: request.stdNum,
        indexDocumentId: request.indexDocumentId,
        title: optionalString(payload.mainTitle) ?? "",
        ...(level === undefined ? {} : { level }),
        ...(sort === undefined ? {} : { sort }),
      },
      clauses,
    },
    metadata: metadata(sourceUrl, clauses.length === sourceClauses.length ? "complete" : "partial"),
    references: { stdNum: request.stdNum, indexDocumentId: request.indexDocumentId, sectionUrl: sourceUrl },
    warnings: [
      ...(clauses.length === 0 ? [{ code: "empty_section" as const, message: "섹션에 문단이 없습니다." }] : []),
      { code: "source_html_preserved" as const, message: "paraContent HTML 조각을 원문 그대로 보존했습니다." },
    ],
  };
};

const toSectionClause = (
  value: unknown,
  sourceUrl: string,
  stdNumFallback: string,
  indexDocumentIdFallback: string,
): SectionClause | undefined => {
  if (!asSoftRecord(value)) return undefined;
  const stdNum = toStringValue(value.stdNum) ?? stdNumFallback;
  const indexDocumentId = toStringValue(value.documentId) ?? indexDocumentIdFallback;
  const paraNum = toStringValue(value.paraNum);
  const paraContent = optionalString(value.paraContent);
  const fullContent = optionalString(value.fullContent) ?? (paraContent === undefined ? undefined : stripHtml(paraContent));
  const uniqueKey = toStringValue(value.uniqueKey);
  const sort = optionalNumber(value.sort);
  const faqDocNumbers = optionalString(value.faqDocNumbers);
  const faqCount = optionalNumber(value.faqCount);
  const kind = paraNum === undefined ? "title" : "paragraph";
  if (stdNum.length === 0 || indexDocumentId.length === 0) {
    throw sourceChanged(sourceUrl, "문단 식별자를 정규화할 수 없습니다.");
  }
  return {
    kind,
    stdNum,
    indexDocumentId,
    ...(uniqueKey === undefined ? {} : { uniqueKey }),
    ...(paraNum === undefined ? {} : { paraNum }),
    ...(paraContent === undefined ? {} : { paraContent }),
    ...(fullContent === undefined ? {} : { fullContent }),
    ...(sort === undefined ? {} : { sort }),
    ...(faqDocNumbers === undefined ? {} : { faqDocNumbers }),
    ...(faqCount === undefined ? {} : { faqCount }),
  };
};

const getParagraph: GetParagraphProvider["getParagraph"] = async (request) => {
  const sourceUrl = paragraphContentUrl(request.stdNum, request.paraNum);
  const payload = asRecord(await fetchKasbJson(sourceUrl), sourceUrl, "paragraph content");
  const paragraphs = asArray(payload.paraContents, sourceUrl, "paraContents");
  const first = paragraphs[0];
  if (first === undefined) {
    throw new ProviderFailure({
      code: "not_found",
      message: `문단 ${request.stdNum}-${request.paraNum}을 찾을 수 없습니다.`,
      retryable: false,
      sourceUrl,
    });
  }
  const paragraph = toParagraph(first, sourceUrl);
  return {
    result: { request, paragraph },
    metadata: metadata(sourceUrl),
    references: {
      stdNum: paragraph.stdNum,
      paraNum: paragraph.paraNum,
      uniqueKey: paragraph.uniqueKey,
      indexDocumentId: paragraph.indexDocumentId,
      paragraphUrl: sourceUrl,
    },
    warnings: [{ code: "source_html_preserved", message: "paraContent HTML 조각을 원문 그대로 보존했습니다." }],
  };
};

const toParagraph = (value: unknown, sourceUrl: string): Paragraph => {
  const item = asRecord(value, sourceUrl, "paragraph");
  const stdNum = toStringValue(item.stdNum);
  const paraNum = toStringValue(item.paraNum);
  const uniqueKey = toStringValue(item.uniqueKey);
  const indexDocumentId = toStringValue(item.documentId);
  const paraContent = optionalString(item.paraContent);
  const fullContent = optionalString(item.fullContent);
  if (
    stdNum === undefined ||
    paraNum === undefined ||
    uniqueKey === undefined ||
    indexDocumentId === undefined ||
    paraContent === undefined ||
    fullContent === undefined
  ) {
    throw sourceChanged(sourceUrl, "문단 응답 필수 필드가 변경되었습니다.");
  }
  const sort = optionalNumber(item.sort);
  const faqDocNumbers = optionalString(item.faqDocNumbers);
  const faqCount = optionalNumber(item.faqCount);
  return {
    stdNum,
    paraNum,
    uniqueKey,
    indexDocumentId,
    paraContent,
    fullContent,
    ...(sort === undefined ? {} : { sort }),
    ...(faqDocNumbers === undefined ? {} : { faqDocNumbers }),
    ...(faqCount === undefined ? {} : { faqCount }),
  };
};

const searchQnas: SearchQnasProvider["search"] = async (request) => {
  const sourceUrl = qnasSearchUrl({
    searchWord: request.keyword,
    page: request.page,
    rows: request.rows,
    types: request.types,
  });
  const payload = asRecord(await fetchKasbJson(sourceUrl), sourceUrl, "qnas search");
  const sourceItems = asArray(payload.facilityQnas, sourceUrl, "facilityQnas");
  const items = sourceItems
    .map((item) => toQnaSearchItem(item, sourceUrl))
    .filter((item): item is QnaSearchItem => item !== undefined);
  const countByType = asSoftRecord(payload.facilityQnaCountData)
    ? Object.fromEntries(
        Object.entries(payload.facilityQnaCountData).filter((entry): entry is [string, number] =>
          typeof entry[1] === "number",
        ),
      )
    : {};

  return {
    result: { request, items, returnedCount: items.length, countByType },
    metadata: metadata(sourceUrl, items.length === sourceItems.length ? "complete" : "partial"),
    references: { searchUrl: sourceUrl },
    warnings: [{ code: "source_html_preserved", message: "검색 하이라이트 HTML은 plain text로 정규화했습니다." }],
  };
};

const toQnaSearchItem = (value: unknown, sourceUrl: string): QnaSearchItem | undefined => {
  if (!asSoftRecord(value)) return undefined;
  const docNumber = toStringValue(value.docNumber);
  const type = optionalNumber(value.type);
  if (docNumber === undefined || type === undefined) return undefined;
  const title = arrayText(value.title) || optionalString(value.title) || docNumber;
  const snippet = optionalString(value.fullContent_snippet) ?? arrayText(value.fullContent) ?? "";
  const tags = Array.isArray(value.tags)
    ? value.tags.map(toStringValue).filter((item): item is string => item !== undefined)
    : [];
  const contentLink = optionalString(value.contentLink);
  const publishDate = optionalString(value.publishDate);
  const prefix = optionalString(value.prefixStr);
  return {
    docNumber,
    type,
    title: stripHtml(title),
    snippet: stripHtml(snippet),
    tags,
    deprecated: optionalNumber(value.deprecatedYn) === 1,
    ...(contentLink === undefined ? {} : { contentLink }),
    ...(publishDate === undefined ? {} : { publishDate }),
    ...(prefix === undefined ? {} : { prefix }),
    references: { qnaUrl: qnaContentUrl(docNumber) },
  };
};

const getQna: GetQnaProvider["getQna"] = async (request) => {
  const sourceUrl = qnaContentUrl(request.docNumber, request.keyword);
  const payload = asRecord(await fetchKasbJson(sourceUrl), sourceUrl, "qna detail");
  const sourceQna = payload.facilityQna;
  if (sourceQna === undefined || sourceQna === null) {
    throw new ProviderFailure({
      code: "not_found",
      message: `Q&A 문서 ${request.docNumber}를 찾을 수 없습니다.`,
      retryable: false,
      sourceUrl,
    });
  }
  const qna = toQna(sourceQna, sourceUrl);
  return {
    result: { request, qna },
    metadata: metadata(sourceUrl),
    references: { docNumber: qna.docNumber, qnaUrl: sourceUrl },
    warnings: [{ code: "source_html_preserved", message: "contentHtml과 relStds HTML 조각을 원문 그대로 보존했습니다." }],
  };
};

const toQna = (value: unknown, sourceUrl: string): Qna => {
  const item = asRecord(value, sourceUrl, "qna");
  const docNumber = toStringValue(item.docNumber);
  const type = optionalNumber(item.type);
  const fullContent = optionalString(item.fullContent);
  if (docNumber === undefined || type === undefined || fullContent === undefined) {
    throw sourceChanged(sourceUrl, "Q&A 응답 필수 필드가 변경되었습니다.");
  }
  const id = optionalNumber(item.id);
  const reference = optionalString(item.reference);
  const contentHtml = optionalString(item.contentHtml);
  const relStds = optionalString(item.relStds);
  const contentLink = optionalString(item.contentLink);
  const publishDate = optionalString(item.publishDate) ?? optionalString(item.date);
  const prevDocNumber = optionalString(item.prevDocNumber);
  const nextDocNumber = optionalString(item.nextDocNumber);
  const tags = typeof item.tags === "string"
    ? item.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
    : Array.isArray(item.tags)
      ? item.tags.map(toStringValue).filter((tag): tag is string => tag !== undefined)
      : [];
  return {
    docNumber,
    type,
    title: stripHtml(arrayText(item.title) || optionalString(item.title) || docNumber),
    fullContent,
    tags,
    deprecated: optionalNumber(item.deprecatedYn) === 1,
    ...(id === undefined ? {} : { id }),
    ...(reference === undefined ? {} : { reference }),
    ...(contentHtml === undefined ? {} : { contentHtml }),
    ...(relStds === undefined ? {} : { relStds }),
    ...(contentLink === undefined ? {} : { contentLink }),
    ...(publishDate === undefined ? {} : { publishDate }),
    ...(prevDocNumber === undefined ? {} : { prevDocNumber }),
    ...(nextDocNumber === undefined ? {} : { nextDocNumber }),
  };
};

const asSoftRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const arrayText = (value: unknown): string | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.map(toStringValue).filter((item): item is string => item !== undefined).join(" ");
};
