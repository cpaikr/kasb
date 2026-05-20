import type { GetParagraphProvider } from "../../capabilities/get-paragraph/provider.ts";
import type { Paragraph } from "../../capabilities/get-paragraph/contract.ts";
import type { GetQnaProvider } from "../../capabilities/get-qna/provider.ts";
import type { Qna } from "../../capabilities/get-qna/contract.ts";
import type { GetSectionProvider } from "../../capabilities/get-section/provider.ts";
import type { GetSectionRequest, SectionClause } from "../../capabilities/get-section/contract.ts";
import type { GetStandardStructureProvider } from "../../capabilities/get-standard-structure/provider.ts";
import type { StandardSectionNode } from "../../capabilities/get-standard-structure/contract.ts";
import type { SearchQnaProvider } from "../../capabilities/search-qna/provider.ts";
import type { QnaSearchItem } from "../../capabilities/search-qna/contract.ts";
import type { SearchStandardsProvider } from "../../capabilities/search-standards/provider.ts";
import type { SearchStandardItem, SearchStandardsRequest } from "../../capabilities/search-standards/contract.ts";
import { defaultObservedQnaTypeIds, qnaTypeLabel, qnaTypeLabelsFor } from "../../capabilities/qna-types.ts";
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

const metadata = (
  endpoint: string,
  completeness: "complete" | "partial" = "complete",
  content?: ResultMetadata["content"],
): ResultMetadata => ({
  fetchedAt: new Date().toISOString(),
  source: { system: "kasb", endpoint },
  sourceBehavior: observedSourceBehavior,
  completeness,
  ...(content === undefined ? {} : { content }),
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

export const kasbSearchQnaProvider: SearchQnaProvider = {
  search: (request) => searchQna(request),
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
  assertAnyNormalized(stdCountArr, items, sourceUrl, "기준서 검색 결과 필드가 변경되었습니다.");
  const orderedItems = await orderSearchStandardItems(items, request);
  const limitedItems = request.sort === "relevance" || request.sort === "title"
    ? orderedItems.slice(0, request.limit)
    : await addStandardDisplayMetadata(orderedItems.slice(0, request.limit));
  const incomplete = items.length !== stdCountArr.length;

  return {
    result: {
      request,
      totalMatchCount,
      totalStandardCount: items.length,
      returnedCount: limitedItems.length,
      standards: limitedItems,
      suggestedKeywords: suggestBroaderStandardKeywords(request.keyword),
    },
    metadata: metadata(sourceUrl, incomplete ? "partial" : "complete"),
    references: { searchUrl: sourceUrl },
    warnings: [
      ...(limitedItems.length < items.length
        ? [{ code: "truncated_results" as const, message: `검색 결과를 ${request.limit}개로 제한했습니다.` }]
        : []),
      ...(incomplete
        ? [{ code: "source_metadata_incomplete" as const, message: "일부 기준서 검색 행을 정규화할 수 없어 제외했습니다." }]
        : []),
    ],
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
    nextActions: buildSearchStandardNextActions(stdNum),
  };
};

const buildSearchStandardNextActions = (stdNum: string): SearchStandardItem["nextActions"] => ({
  getStandardStructure: {
    operation: "get-standard-structure",
    input: { stdNum },
  },
});

const orderSearchStandardItems = async (
  items: readonly SearchStandardItem[],
  request: SearchStandardsRequest,
): Promise<SearchStandardItem[]> => {
  if (request.sort === "relevance") {
    return sortSearchStandardItems(
      await addStandardDisplayMetadata(items),
      (left, right) => compareSearchRelevance(request.keyword, left, right),
    );
  }
  if (request.sort === "title") {
    return sortSearchStandardItems(await addStandardDisplayMetadata(items), compareSearchStandardTitle);
  }
  if (request.sort === "std-num") {
    return sortSearchStandardItems(items, compareSearchStandardNumber);
  }
  return sortSearchStandardItems(items, compareSearchStandardMatchCount);
};

const addStandardDisplayMetadata = async (
  items: readonly SearchStandardItem[],
): Promise<SearchStandardItem[]> =>
  mapWithConcurrency(items, 8, async (item) => ({
    ...item,
    ...(await getStandardDisplayMetadata(item.stdNum)),
  }));

type StandardDisplayMetadata = Pick<SearchStandardItem, "standardTitle" | "standardKind">;

type StandardStructureSnapshot = {
  readonly sourceUrl: string;
  readonly sections: readonly StandardSectionNode[];
  readonly incomplete: boolean;
};

type SectionEnrichment = StandardDisplayMetadata & {
  readonly exists: boolean;
  readonly title?: string;
  readonly ref?: string;
  readonly level?: number;
  readonly sort?: number;
};

const getStandardDisplayMetadata = async (
  stdNum: string,
): Promise<StandardDisplayMetadata> => {
  try {
    const snapshot = await fetchStandardStructureSnapshot(stdNum);
    return getStandardDisplayMetadataFromSections(snapshot.sections);
  } catch {
    return {};
  }
};

const fetchStandardStructureSnapshot = async (stdNum: string): Promise<StandardStructureSnapshot> => {
  const sourceUrl = standardIndexesUrl(stdNum);
  const payload = asRecord(await fetchKasbJson(sourceUrl), sourceUrl, "standard indexes");
  const sourceItems = asArray(payload.standardIndexes, sourceUrl, "standardIndexes");
  const sections = sourceItems
    .map((item) => toSectionNode(item, sourceUrl, stdNum))
    .filter((item): item is StandardSectionNode => item !== undefined);
  assertAnyNormalized(sourceItems, sections, sourceUrl, "기준서 구조 행 필드가 변경되었습니다.");
  return {
    sourceUrl,
    sections,
    incomplete: sections.length !== sourceItems.length,
  };
};

const getStandardDisplayMetadataFromSections = (
  sections: readonly StandardSectionNode[],
): StandardDisplayMetadata => {
  const standardTitle = sections.find((section) => section.level === 1)?.title;
  if (standardTitle === undefined) return {};
  return {
    standardTitle,
    standardKind: inferStandardKind(standardTitle),
  };
};

const getOptionalSectionEnrichment = async (
  stdNum: string,
  indexDocumentId: string,
): Promise<SectionEnrichment | undefined> => {
  try {
    const snapshot = await fetchStandardStructureSnapshot(stdNum);
    const section = snapshot.sections.find((item) => item.indexDocumentId === indexDocumentId);
    return {
      ...getStandardDisplayMetadataFromSections(snapshot.sections),
      exists: section !== undefined,
      ...(section?.title === undefined ? {} : { title: section.title }),
      ...(section?.ref === undefined ? {} : { ref: section.ref }),
      ...(section?.level === undefined ? {} : { level: section.level }),
      ...(section?.sort === undefined ? {} : { sort: section.sort }),
    };
  } catch {
    return undefined;
  }
};

const sortSearchStandardItems = (
  items: readonly SearchStandardItem[],
  compare: (left: SearchStandardItem, right: SearchStandardItem) => number,
): SearchStandardItem[] => [...items].sort(compare);

const compareSearchRelevance = (
  keyword: string,
  left: SearchStandardItem,
  right: SearchStandardItem,
): number =>
  compareDescending(titleRelevanceScore(keyword, left.standardTitle), titleRelevanceScore(keyword, right.standardTitle)) ||
  compareSearchStandardMatchCount(left, right) ||
  compareSearchStandardNumber(left, right) ||
  compareSearchStandardTitle(left, right);

const compareSearchStandardMatchCount = (left: SearchStandardItem, right: SearchStandardItem): number =>
  compareDescending(left.matchCount, right.matchCount) || compareSearchStandardNumber(left, right);

const compareSearchStandardNumber = (left: SearchStandardItem, right: SearchStandardItem): number => {
  const leftNumber = numericStdNum(left.stdNum);
  const rightNumber = numericStdNum(right.stdNum);
  if (leftNumber !== undefined && rightNumber !== undefined && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  return left.stdNum.localeCompare(right.stdNum, "ko");
};

const compareSearchStandardTitle = (left: SearchStandardItem, right: SearchStandardItem): number => {
  if (left.standardTitle === undefined && right.standardTitle === undefined) return compareSearchStandardNumber(left, right);
  if (left.standardTitle === undefined) return 1;
  if (right.standardTitle === undefined) return -1;
  return left.standardTitle.localeCompare(right.standardTitle, "ko") || compareSearchStandardNumber(left, right);
};

const titleRelevanceScore = (keyword: string, standardTitle: string | undefined): number => {
  if (standardTitle === undefined) return 0;
  const normalizedKeyword = normalizeSearchText(keyword);
  if (normalizedKeyword.length === 0) return 0;
  const normalizedSubject = normalizeSearchText(stripStandardTitlePrefix(standardTitle));
  const normalizedTitle = normalizeSearchText(standardTitle);
  if (normalizedSubject === normalizedKeyword) return 4;
  if (normalizedSubject.startsWith(normalizedKeyword)) return 3;
  if (normalizedSubject.includes(normalizedKeyword)) return 2;
  if (normalizedTitle.includes(normalizedKeyword)) return 1;
  return 0;
};

const stripStandardTitlePrefix = (standardTitle: string): string =>
  stripHtml(standardTitle)
    .replace(/^기업회계기준(?:해석)?서\s*제?\s*\d+[A-Za-z]?\s*호?\s*/u, "")
    .replace(/^한국채택국제회계기준\s*제?\s*\d+[A-Za-z]?\s*호?\s*/u, "")
    .replace(/^일반기업회계기준\s*/u, "")
    .replace(/^제\s*\d+\s*장\s*/u, "")
    .trim();

const normalizeSearchText = (value: string): string =>
  stripHtml(value)
    .normalize("NFKC")
    .toLocaleLowerCase("ko")
    .replace(/[\s\-_,，.()（）「」『』·ㆍ:：]/gu, "");

const numericStdNum = (stdNum: string): number | undefined => /^\d+$/u.test(stdNum) ? Number(stdNum) : undefined;

const compareDescending = (left: number, right: number): number => right - left;

const mapWithConcurrency = async <Input, Output>(
  values: readonly Input[],
  concurrency: number,
  map: (value: Input) => Promise<Output>,
): Promise<Output[]> => {
  const results = new Array<Output>(values.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await map(values[index] as Input);
    }
  });

  await Promise.all(workers);
  return results;
};

const inferStandardKind = (standardTitle: string): string => {
  if (standardTitle.includes("기업회계기준해석서")) return "k-ifrs-interpretation";
  if (standardTitle.includes("기업회계기준서")) return "k-ifrs-standard";
  if (/^제\d+장(?:\s|$)/u.test(standardTitle)) return "general-gaap-chapter";
  return "standard";
};

const suggestBroaderStandardKeywords = (keyword: string): string[] => {
  const suggestions = new Set<string>();
  const normalizedKeyword = keyword.trim();
  const mappedSuggestions: readonly [string, string][] = [
    ["기타장기종업원급여", "종업원급여"],
    ["장기종업원급여", "종업원급여"],
    ["장기근속급여", "종업원급여"],
    ["장기근속", "종업원급여"],
  ];

  for (const [narrowKeyword, broaderKeyword] of mappedSuggestions) {
    if (normalizedKeyword.includes(narrowKeyword)) suggestions.add(broaderKeyword);
  }

  const withoutAccountingTreatment = normalizedKeyword.replace(/\s*회계처리\s*$/u, "").trim();
  if (withoutAccountingTreatment.length > 0 && withoutAccountingTreatment !== normalizedKeyword) {
    suggestions.add(withoutAccountingTreatment);
  }

  suggestions.delete(normalizedKeyword);
  return [...suggestions];
};

const getStandardStructure: GetStandardStructureProvider["getStructure"] = async (request) => {
  const baseSnapshot = await fetchStandardStructureSnapshot(request.stdNum);
  const baseSourceUrl = baseSnapshot.sourceUrl;
  const sourceUrl = request.keyword === undefined ? baseSourceUrl : standardIndexesUrl(request.stdNum, request.keyword);
  const baseSections = baseSnapshot.sections;
  const incomplete = baseSnapshot.incomplete;

  if (baseSections.length === 0) {
    throw new ProviderFailure({
      code: "not_found",
      message: `기준서 ${request.stdNum}의 구조를 찾을 수 없습니다.`,
      retryable: false,
      sourceUrl: baseSourceUrl,
    });
  }

  const sections = request.keyword === undefined
    ? baseSections
    : filterSectionsBySearchMetadata(
        baseSections,
        asRecord(await fetchKasbJson(sourceUrl), sourceUrl, "standard index search"),
        sourceUrl,
      );

  const hasHtmlTitle = sections.some((section) => /<[^>]+>/u.test(section.title));

  return {
    result: { request, sections, returnedCount: sections.length },
    metadata: metadata(
      sourceUrl,
      incomplete ? "partial" : "complete",
      hasHtmlTitle
        ? {
            htmlFields: ["result.sections[].title"],
            notes: ["일부 구조 title은 KASB 원천 HTML 조각을 보존합니다."],
          }
        : undefined,
    ),
    references: { stdNum: request.stdNum, structureUrl: sourceUrl },
    warnings: [
      ...(request.keyword === undefined
        ? []
        : [{ code: "search_filtered_structure" as const, message: "keyword가 적용된 구조 결과입니다." }]),
      ...(incomplete
        ? [{ code: "source_metadata_incomplete" as const, message: "일부 기준서 구조 행을 정규화할 수 없어 제외했습니다." }]
        : []),
    ],
  };
};

const filterSectionsBySearchMetadata = (
  sections: readonly StandardSectionNode[],
  payload: Record<string, unknown>,
  sourceUrl: string,
): StandardSectionNode[] => {
  const searchedIndexCountMap = asRecord(payload.searchedIndexCountMap, sourceUrl, "searchedIndexCountMap");
  const knownIndexDocumentIds = new Set(sections.map((section) => section.indexDocumentId));
  const matchedIndexDocumentIds = new Set<string>();

  for (const [indexDocumentId, count] of Object.entries(searchedIndexCountMap)) {
    if (indexDocumentId === "null") continue;
    const matchCount = optionalNumber(count);
    if (matchCount === undefined) {
      throw sourceChanged(sourceUrl, "검색된 기준서 구조 행의 match count가 변경되었습니다.");
    }
    if (!knownIndexDocumentIds.has(indexDocumentId)) {
      throw sourceChanged(sourceUrl, "검색된 기준서 구조 행의 documentId가 기준서 구조와 일치하지 않습니다.");
    }
    if (matchCount > 0) {
      matchedIndexDocumentIds.add(indexDocumentId);
    }
  }

  return sections.filter((section) => matchedIndexDocumentIds.has(section.indexDocumentId));
};

const toSectionNode = (
  value: unknown,
  sourceUrl: string,
  expectedStdNum: string,
): StandardSectionNode | undefined => {
  if (!asSoftRecord(value)) return undefined;
  const indexDocumentId = toStringValue(value.documentId);
  const stdNum = toStringValue(value.stdNum);
  const title = optionalString(value.title);
  const level = optionalNumber(value.level);
  if (indexDocumentId === undefined || stdNum === undefined || title === undefined || level === undefined) {
    return undefined;
  }
  if (stdNum !== expectedStdNum) {
    throw sourceChanged(sourceUrl, "기준서 구조 행의 stdNum이 요청과 일치하지 않습니다.");
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

type ResolvedSectionLookup = StandardDisplayMetadata & {
  readonly indexDocumentId: string;
  readonly ref?: string;
  readonly title?: string;
  readonly level?: number;
  readonly sort?: number;
  readonly ambiguousRef?: boolean;
};

const resolveSectionLookup = async (request: GetSectionRequest): Promise<ResolvedSectionLookup> => {
  if (request.indexDocumentId !== undefined) {
    return { indexDocumentId: request.indexDocumentId };
  }

  const requestedRef = request.ref;
  if (requestedRef === undefined) {
    throw new ProviderFailure({
      code: "internal_failure",
      message: "섹션 조회 요청에 indexDocumentId와 ref가 모두 없습니다.",
      retryable: false,
    });
  }

  const snapshot = await fetchStandardStructureSnapshot(request.stdNum);
  const sourceUrl = snapshot.sourceUrl;
  const sections = snapshot.sections;

  const matches = sections.filter((section) => normalizeRef(section.ref) === normalizeRef(requestedRef));
  if (matches.length === 0) {
    throw new ProviderFailure({
      code: "not_found",
      message: `기준서 ${request.stdNum}에서 ref ${requestedRef}에 해당하는 섹션을 찾을 수 없습니다. get-standard-structure로 사용 가능한 ref와 indexDocumentId를 다시 확인하세요.`,
      retryable: false,
      sourceUrl,
    });
  }

  const selected = [...matches].sort(
    (left, right) => right.level - left.level || (left.sort ?? 0) - (right.sort ?? 0),
  )[0];
  if (selected === undefined) {
    throw sourceChanged(sourceUrl, "ref 섹션 해석 결과를 정규화할 수 없습니다.");
  }
  return {
    indexDocumentId: selected.indexDocumentId,
    ref: selected.ref,
    title: selected.title,
    level: selected.level,
    ...(selected.sort === undefined ? {} : { sort: selected.sort }),
    ...getStandardDisplayMetadataFromSections(sections),
    ...(matches.length > 1 ? { ambiguousRef: true } : {}),
  };
};

const normalizeRef = (ref: string): string => ref.replaceAll(/\s+/gu, "");

const getSection: GetSectionProvider["getSection"] = async (request) => {
  const lookup = await resolveSectionLookup(request);
  const sourceUrl = paragraphsUrl(request.stdNum, lookup.indexDocumentId, request.keyword);
  const payload = asRecord(await fetchKasbJson(sourceUrl), sourceUrl, "paragraphs");
  const sourceClauses = asArray(payload.clauses, sourceUrl, "clauses");
  const clauses = sourceClauses
    .map((item) => toSectionClause(item, sourceUrl, request.stdNum, lookup.indexDocumentId))
    .filter((item): item is SectionClause => item !== undefined);
  assertAnyNormalized(sourceClauses, clauses, sourceUrl, "섹션 문단 행 필드가 변경되었습니다.");
  const incomplete = clauses.length !== sourceClauses.length;
  const sectionEnrichment = await getOptionalSectionEnrichment(request.stdNum, lookup.indexDocumentId);

  if (clauses.length === 0 && sectionEnrichment?.exists !== true) {
    if (sectionEnrichment === undefined) {
      await assertSectionExists(request.stdNum, lookup.indexDocumentId, sourceUrl);
    } else {
      throw new ProviderFailure({
        code: "not_found",
        message: "요청한 indexDocumentId 또는 ref에 해당하는 섹션을 찾을 수 없습니다. get-standard-structure를 실행해 반환된 indexDocumentId를 사용하세요. 브라우저 경로의 titleDocumentId는 v1에서 허용되지 않습니다.",
        retryable: false,
        sourceUrl,
      });
    }
  }

  const standardTitle = lookup.standardTitle ?? sectionEnrichment?.standardTitle;
  const standardKind = lookup.standardKind ?? sectionEnrichment?.standardKind;
  const ref = lookup.ref ?? sectionEnrichment?.ref;
  const sectionTitle = optionalString(payload.mainTitle) ?? lookup.title ?? sectionEnrichment?.title ?? "";
  const level = optionalNumber(payload.mainTitleLevel) ?? lookup.level ?? sectionEnrichment?.level;
  const sort = optionalNumber(payload.mainTitleSort) ?? lookup.sort ?? sectionEnrichment?.sort;
  return {
    result: {
      request,
      section: {
        stdNum: request.stdNum,
        indexDocumentId: lookup.indexDocumentId,
        ...(standardTitle === undefined ? {} : { standardTitle }),
        ...(standardKind === undefined ? {} : { standardKind }),
        title: sectionTitle,
        ...(ref === undefined ? {} : { ref }),
        ...(level === undefined ? {} : { level }),
        ...(sort === undefined ? {} : { sort }),
      },
      clauses,
    },
    metadata: metadata(sourceUrl, incomplete ? "partial" : "complete", {
      htmlFields: ["result.clauses[].paraContent"],
      textFields: ["result.clauses[].fullContent"],
      notes: ["paraContent는 원천 HTML 조각이며 fullContent는 plain text 정규화 결과입니다."],
    }),
    references: {
      stdNum: request.stdNum,
      indexDocumentId: lookup.indexDocumentId,
      ...(standardTitle === undefined ? {} : { standardTitle }),
      ...(standardKind === undefined ? {} : { standardKind }),
      ...(sectionTitle.length === 0 ? {} : { sectionTitle }),
      ...(ref === undefined ? {} : { sectionRef: ref }),
      sectionUrl: sourceUrl,
    },
    warnings: [
      ...(lookup.ambiguousRef === true
        ? [{ code: "ambiguous_ref_resolved" as const, message: "여러 섹션이 같은 ref를 사용해 가장 구체적인 하위 섹션을 선택했습니다." }]
        : []),
      ...(clauses.length === 0 ? [{ code: "empty_section" as const, message: "섹션에 문단이 없습니다." }] : []),
      ...(incomplete
        ? [{ code: "partial_clause_normalization" as const, message: "일부 섹션 문단 행을 정규화할 수 없어 제외했습니다." }]
        : []),
    ],
  };
};

const assertSectionExists = async (
  stdNum: string,
  indexDocumentId: string,
  sourceUrl: string,
): Promise<void> => {
  const structureUrl = standardIndexesUrl(stdNum);
  const structure = asRecord(await fetchKasbJson(structureUrl), structureUrl, "standard indexes");
  const exists = asArray(structure.standardIndexes, structureUrl, "standardIndexes").some((item) =>
    asSoftRecord(item) && toStringValue(item.documentId) === indexDocumentId,
  );
  if (!exists) {
    throw new ProviderFailure({
      code: "not_found",
      message: "요청한 indexDocumentId 또는 ref에 해당하는 섹션을 찾을 수 없습니다. get-standard-structure를 실행해 반환된 indexDocumentId를 사용하세요. 브라우저 경로의 titleDocumentId는 v1에서 허용되지 않습니다.",
      retryable: false,
      sourceUrl,
    });
  }
};

const toSectionClause = (
  value: unknown,
  sourceUrl: string,
  stdNumFallback: string,
  indexDocumentIdFallback: string,
): SectionClause | undefined => {
  if (!asSoftRecord(value)) return undefined;
  const explicitStdNum = toStringValue(value.stdNum);
  const explicitIndexDocumentId = toStringValue(value.documentId);
  if (explicitStdNum !== undefined && explicitStdNum !== stdNumFallback) {
    throw sourceChanged(sourceUrl, "섹션 문단 행의 stdNum이 요청과 일치하지 않습니다.");
  }
  const stdNum = explicitStdNum ?? stdNumFallback;
  const indexDocumentId = explicitIndexDocumentId ?? indexDocumentIdFallback;
  const paraNum = toStringValue(value.paraNum);
  const title = optionalString(value.title);
  const paraContent = optionalString(value.paraContent);
  const fullContent = optionalString(value.fullContent) ?? (paraContent === undefined ? undefined : stripHtml(paraContent));
  const uniqueKey = toStringValue(value.uniqueKey);
  const sort = optionalNumber(value.sort);
  const faqDocNumbers = optionalString(value.faqDocNumbers);
  const faqCount = optionalNumber(value.faqCount);
  if (
    explicitIndexDocumentId === undefined &&
    paraNum === undefined &&
    paraContent === undefined &&
    fullContent === undefined &&
    uniqueKey === undefined &&
    title === undefined &&
    optionalString(value.type) === undefined
  ) {
    return undefined;
  }
  const kind = paraNum === undefined ? "title" : "paragraph";
  if (stdNum.length === 0 || indexDocumentId.length === 0) {
    throw sourceChanged(sourceUrl, "문단 식별자를 정규화할 수 없습니다.");
  }
  return {
    kind,
    stdNum,
    indexDocumentId,
    ...(title === undefined ? {} : { title }),
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
  if (
    paragraph.stdNum !== request.stdNum ||
    paragraph.paraNum !== request.paraNum ||
    paragraph.uniqueKey !== `${request.stdNum}-${request.paraNum}`
  ) {
    throw sourceChanged(sourceUrl, "문단 응답 식별자가 요청과 일치하지 않습니다.");
  }
  const sectionEnrichment = await getOptionalSectionEnrichment(paragraph.stdNum, paragraph.indexDocumentId);
  const enrichedParagraph: Paragraph = {
    ...paragraph,
    ...(sectionEnrichment?.standardTitle === undefined ? {} : { standardTitle: sectionEnrichment.standardTitle }),
    ...(sectionEnrichment?.standardKind === undefined ? {} : { standardKind: sectionEnrichment.standardKind }),
    ...(sectionEnrichment?.title === undefined ? {} : { sectionTitle: sectionEnrichment.title }),
    ...(sectionEnrichment?.ref === undefined ? {} : { sectionRef: sectionEnrichment.ref }),
  };
  return {
    result: { request, paragraph: enrichedParagraph },
    metadata: metadata(sourceUrl, "complete", {
      htmlFields: ["result.paragraph.paraContent"],
      textFields: ["result.paragraph.fullContent"],
      notes: ["paraContent는 원천 HTML 조각이며 fullContent는 plain text 정규화 결과입니다."],
    }),
    references: {
      stdNum: enrichedParagraph.stdNum,
      paraNum: enrichedParagraph.paraNum,
      uniqueKey: enrichedParagraph.uniqueKey,
      indexDocumentId: enrichedParagraph.indexDocumentId,
      ...(enrichedParagraph.standardTitle === undefined ? {} : { standardTitle: enrichedParagraph.standardTitle }),
      ...(enrichedParagraph.standardKind === undefined ? {} : { standardKind: enrichedParagraph.standardKind }),
      ...(enrichedParagraph.sectionTitle === undefined ? {} : { sectionTitle: enrichedParagraph.sectionTitle }),
      ...(enrichedParagraph.sectionRef === undefined ? {} : { sectionRef: enrichedParagraph.sectionRef }),
      paragraphUrl: sourceUrl,
    },
    warnings: sectionEnrichment?.exists === true
      ? []
      : [{ code: "paragraph_metadata_incomplete" as const, message: "문단의 상위 기준서/섹션 metadata를 완전히 확인할 수 없습니다." }],
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

const searchQna: SearchQnaProvider["search"] = async (request) => {
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
  assertAnyNormalized(sourceItems, items, sourceUrl, "Q&A 검색 결과 필드가 변경되었습니다.");
  const incomplete = items.length !== sourceItems.length;
  const sourceCountData = payload.facilityQnaCountData;
  const countByType = asSoftRecord(sourceCountData)
    ? Object.fromEntries(
        Object.entries(sourceCountData).filter((entry): entry is [string, number] =>
          typeof entry[1] === "number",
        ),
      )
    : {};
  const countMetadataIncomplete =
    !asSoftRecord(sourceCountData) || Object.keys(countByType).length !== Object.keys(sourceCountData).length;
  const paginationStatus = countMetadataIncomplete ? "estimated" : "known";
  const totalCount = countMetadataIncomplete
    ? (request.page - 1) * request.rows + items.length
    : sumQnaCounts(countByType, request.types);
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / request.rows);
  const hasNextPage = !countMetadataIncomplete && request.page < totalPages;

  const requestedTypeIds = request.types?.split(",") ?? defaultObservedQnaTypeIds;
  const typeLabels = qnaTypeLabelsFor(new Set([...requestedTypeIds, ...Object.keys(countByType), ...items.map((item) => String(item.type))]));

  return {
    result: {
      request,
      items,
      returnedCount: items.length,
      totalCount,
      totalPages,
      hasNextPage,
      paginationStatus,
      countByType,
      typeLabels,
      suggestedKeywords: suggestBroaderQnaKeywords(request.keyword, totalCount),
    },
    metadata: metadata(sourceUrl, incomplete || countMetadataIncomplete ? "partial" : "complete", {
      textFields: ["result.items[].title", "result.items[].snippet"],
      notes: ["검색 하이라이트 HTML은 title과 snippet의 plain text로 정규화하고 snippet은 빠른 스캔을 위해 길이를 제한합니다."],
    }),
    references: { searchUrl: sourceUrl },
    warnings: [
      ...(incomplete
        ? [{ code: "source_metadata_incomplete" as const, message: "일부 Q&A 검색 행을 정규화할 수 없어 제외했습니다." }]
        : []),
      ...(countMetadataIncomplete
        ? [{ code: "source_metadata_incomplete" as const, message: "Q&A 검색 count metadata를 완전히 정규화할 수 없어 pagination metadata가 보수적으로 계산되었습니다." }]
        : []),
    ],
  };
};

const sumQnaCounts = (countByType: Record<string, number>, requestedTypes: string | undefined): number => {
  const typeIds = requestedTypes?.split(",") ?? Object.keys(countByType);
  return typeIds.reduce((sum, typeId) => sum + (countByType[typeId] ?? 0), 0);
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
    typeLabel: qnaTypeLabel(type),
    title: stripHtml(title),
    snippet: truncateQnaSnippet(normalizeQnaPlainText(stripHtml(snippet))),
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
  if (qna.docNumber !== request.docNumber) {
    throw sourceChanged(sourceUrl, "Q&A 응답 식별자가 요청과 일치하지 않습니다.");
  }
  return {
    result: { request, qna },
    metadata: metadata(sourceUrl, "complete", {
      htmlFields: ["result.qna.contentHtml", "result.qna.relStds"],
      textFields: ["result.qna.fullContent"],
      notes: ["contentHtml과 relStds는 원천 HTML 조각이며 fullContent는 원천 plain text 본문입니다."],
    }),
    references: { docNumber: qna.docNumber, qnaUrl: sourceUrl },
    warnings: [],
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
    typeLabel: qnaTypeLabel(type),
    title: stripHtml(arrayText(item.title) || optionalString(item.title) || docNumber),
    fullContent: normalizeQnaPlainText(fullContent),
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

const normalizeQnaPlainText = (value: string): string =>
  value.replace(/(?:\bundefined\b\s*){2,}$/u, "").trim();

const qnaSnippetMaxLength = 280;

const truncateQnaSnippet = (value: string): string =>
  value.length <= qnaSnippetMaxLength ? value : `${value.slice(0, qnaSnippetMaxLength).trimEnd()}…`;

const suggestBroaderQnaKeywords = (keyword: string, totalCount: number): string[] => {
  if (totalCount > 0) return [];

  const suggestions = new Set<string>();
  const normalizedKeyword = keyword.trim();
  const mappedSuggestions: readonly [string, readonly string[]][] = [
    ["기타장기종업원급여", ["기타 장기 종업원 급여", "장기종업원급여", "종업원급여"]],
    ["장기종업원급여", ["장기 종업원 급여", "종업원급여"]],
    ["장기근속급여", ["장기근속 급여", "종업원급여"]],
    ["장기근속", ["종업원급여"]],
  ];

  for (const [narrowKeyword, broaderKeywords] of mappedSuggestions) {
    if (normalizedKeyword.includes(narrowKeyword)) {
      for (const broaderKeyword of broaderKeywords) suggestions.add(broaderKeyword);
    }
  }

  const withoutAccountingTreatment = normalizedKeyword.replace(/\s*회계처리\s*$/u, "").trim();
  if (withoutAccountingTreatment.length > 0 && withoutAccountingTreatment !== normalizedKeyword) {
    suggestions.add(withoutAccountingTreatment);
  }

  suggestions.delete(normalizedKeyword);
  return [...suggestions];
};

const assertAnyNormalized = (
  sourceItems: readonly unknown[],
  normalizedItems: readonly unknown[],
  sourceUrl: string,
  message: string,
): void => {
  if (sourceItems.length > 0 && normalizedItems.length === 0) {
    throw sourceChanged(sourceUrl, message);
  }
};

const asSoftRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const arrayText = (value: unknown): string | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.map(toStringValue).filter((item): item is string => item !== undefined).join(" ");
};
