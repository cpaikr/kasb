import type { GetParagraphProvider } from "../../capabilities/get-paragraph/provider.ts";
import type { Paragraph } from "../../capabilities/get-paragraph/contract.ts";
import type { GetQnaProvider } from "../../capabilities/get-qna/provider.ts";
import type { Qna } from "../../capabilities/get-qna/contract.ts";
import type { GetSectionProvider } from "../../capabilities/get-section/provider.ts";
import type { GetSectionRequest, SectionClause } from "../../capabilities/get-section/contract.ts";
import type { GetStandardStructureProvider } from "../../capabilities/get-standard-structure/provider.ts";
import type { StandardSectionNode } from "../../capabilities/get-standard-structure/contract.ts";
import type { SearchQnaProvider } from "../../capabilities/search-qna/provider.ts";
import type { QnaSearchItem, SearchQnaRequest, SearchQnaResult } from "../../capabilities/search-qna/contract.ts";
import type { SearchStandardsProvider } from "../../capabilities/search-standards/provider.ts";
import type { SearchStandardItem, SearchStandardsRequest } from "../../capabilities/search-standards/contract.ts";
import { defaultObservedQnaTypeIds, qnaTypeLabel, qnaTypeLabelsFor } from "../../capabilities/qna-types.ts";
import { ProviderFailure, type KasbExecutionContext, type ResultMetadata } from "../../capabilities/types.ts";
import { fetchKasbJson } from "./fetch-json.ts";
import {
  asArray,
  asRecord,
  optionalNumber,
  optionalString,
  sourceChanged,
  normalizeKasbPlainText,
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
  search: (request, context) => searchStandards(request, context),
};

export const kasbStandardStructureProvider: GetStandardStructureProvider = {
  getStructure: (request, context) => getStandardStructure(request, context),
};

export const kasbSectionProvider: GetSectionProvider = {
  getSection: (request, context) => getSection(request, context),
};

export const kasbParagraphProvider: GetParagraphProvider = {
  getParagraph: (request, context) => getParagraph(request, context),
};

export const kasbSearchQnaProvider: SearchQnaProvider = {
  search: (request, context) => searchQna(request, context),
};

export const kasbQnaProvider: GetQnaProvider = {
  getQna: (request, context) => getQna(request, context),
};

const searchStandards: SearchStandardsProvider["search"] = async (request, context) => {
  const sourceUrl = standardsSearchUrl(request.keyword);
  const payload = asRecord(await fetchKasbJson(sourceUrl, context), sourceUrl, "standard search");
  const standards = asRecord(payload.standards, sourceUrl, "standards");
  const stdCountArr = asArray(standards.stdCountArr, sourceUrl, "stdCountArr");
  const totalMatchCount = optionalNumber(standards.totalCount) ?? 0;

  const items = stdCountArr
    .map((item) => toSearchStandardItem(item, sourceUrl))
    .filter((item): item is SearchStandardItem => item !== undefined);
  assertAnyNormalized(stdCountArr, items, sourceUrl, "Standard search result fields changed.");
  const orderedItems = await orderSearchStandardItems(items, request, context);
  const limitedItems = request.sort === "relevance" || request.sort === "title"
    ? orderedItems.slice(0, request.limit)
    : await addStandardDisplayMetadata(orderedItems.slice(0, request.limit), context);
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
        ? [{ code: "truncated_results" as const, message: `Search results were limited to ${request.limit} items.` }]
        : []),
      ...(incomplete
        ? [{ code: "source_metadata_incomplete" as const, message: "Some standard search rows could not be normalized and were omitted." }]
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
  context: KasbExecutionContext | undefined,
): Promise<SearchStandardItem[]> => {
  if (request.sort === "relevance") {
    return sortSearchStandardItems(
      await addStandardDisplayMetadata(items, context),
      (left, right) => compareSearchRelevance(request.keyword, left, right),
    );
  }
  if (request.sort === "title") {
    return sortSearchStandardItems(await addStandardDisplayMetadata(items, context), compareSearchStandardTitle);
  }
  if (request.sort === "std-num") {
    return sortSearchStandardItems(items, compareSearchStandardNumber);
  }
  return sortSearchStandardItems(items, compareSearchStandardMatchCount);
};

const addStandardDisplayMetadata = async (
  items: readonly SearchStandardItem[],
  context: KasbExecutionContext | undefined,
): Promise<SearchStandardItem[]> =>
  mapWithConcurrency(items, 8, async (item) => ({
    ...item,
    ...(await getStandardDisplayMetadata(item.stdNum, context)),
  }));

type StandardDisplayMetadata = Pick<SearchStandardItem, "standardTitle" | "standardKind">;

type StandardStructureSnapshot = {
  readonly sourceUrl: string;
  readonly sections: readonly StandardSectionNode[];
  readonly indexDocumentIds: ReadonlySet<string>;
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
  context: KasbExecutionContext | undefined,
): Promise<StandardDisplayMetadata> => {
  try {
    const snapshot = await fetchStandardStructureSnapshot(stdNum, context);
    return getStandardDisplayMetadataFromSections(snapshot.sections);
  } catch (error) {
    if (context?.signal?.aborted === true) {
      throw error;
    }
    return {};
  }
};

const fetchStandardStructureSnapshot = async (
  stdNum: string,
  context: KasbExecutionContext | undefined,
): Promise<StandardStructureSnapshot> => {
  const sourceUrl = standardIndexesUrl(stdNum);
  const payload = asRecord(await fetchKasbJson(sourceUrl, context), sourceUrl, "standard indexes");
  const sourceItems = asArray(payload.standardIndexes, sourceUrl, "standardIndexes");
  const sections = sourceItems
    .map((item) => toSectionNode(item, sourceUrl, stdNum))
    .filter((item): item is StandardSectionNode => item !== undefined);
  const indexDocumentIds = new Set(
    sourceItems
      .map((item) => toRawStructureIndexDocumentId(item, sourceUrl, stdNum))
      .filter((item): item is string => item !== undefined),
  );
  assertAnyNormalized(sourceItems, sections, sourceUrl, "Standard structure row fields changed.");
  return {
    sourceUrl,
    sections,
    indexDocumentIds,
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

const getSectionEnrichmentFromSnapshot = (
  snapshot: StandardStructureSnapshot,
  indexDocumentId: string,
): SectionEnrichment => {
  const section = snapshot.sections.find((item) => item.indexDocumentId === indexDocumentId);
  return {
    ...getStandardDisplayMetadataFromSections(snapshot.sections),
    exists: section !== undefined || snapshot.indexDocumentIds.has(indexDocumentId),
    ...(section?.title === undefined ? {} : { title: section.title }),
    ...(section?.ref === undefined ? {} : { ref: section.ref }),
    ...(section?.level === undefined ? {} : { level: section.level }),
    ...(section?.sort === undefined ? {} : { sort: section.sort }),
  };
};

const getOptionalSectionEnrichment = async (
  stdNum: string,
  indexDocumentId: string,
  context: KasbExecutionContext | undefined,
): Promise<SectionEnrichment | undefined> => {
  try {
    const snapshot = await fetchStandardStructureSnapshot(stdNum, context);
    return getSectionEnrichmentFromSnapshot(snapshot, indexDocumentId);
  } catch (error) {
    if (context?.signal?.aborted === true) {
      throw error;
    }
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

const getStandardStructure: GetStandardStructureProvider["getStructure"] = async (request, context) => {
  const baseSnapshot = await fetchStandardStructureSnapshot(request.stdNum, context);
  const baseSourceUrl = baseSnapshot.sourceUrl;
  const sourceUrl = request.keyword === undefined ? baseSourceUrl : standardIndexesUrl(request.stdNum, request.keyword);
  const baseSections = baseSnapshot.sections;
  const incomplete = baseSnapshot.incomplete;

  if (baseSections.length === 0) {
    throw new ProviderFailure({
      code: "not_found",
      message: `Could not find the structure for standard ${request.stdNum}.`,
      retryable: false,
      sourceUrl: baseSourceUrl,
    });
  }

  const sections = request.keyword === undefined
    ? baseSections
    : filterSectionsBySearchMetadata(
        baseSections,
        asRecord(await fetchKasbJson(sourceUrl, context), sourceUrl, "standard index search"),
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
            notes: ["Some structure titles preserve KASB source HTML fragments."],
          }
        : undefined,
    ),
    references: { stdNum: request.stdNum, structureUrl: sourceUrl },
    warnings: [
      ...(request.keyword === undefined
        ? []
        : [{ code: "search_filtered_structure" as const, message: "Structure results are filtered by keyword." }]),
      ...(incomplete
        ? [{ code: "source_metadata_incomplete" as const, message: "Some standard structure rows could not be normalized and were omitted." }]
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
      throw sourceChanged(sourceUrl, "Matched standard structure row match count changed.");
    }
    if (!knownIndexDocumentIds.has(indexDocumentId)) {
      throw sourceChanged(sourceUrl, "Matched standard structure row documentId does not match the standard structure.");
    }
    if (matchCount > 0) {
      matchedIndexDocumentIds.add(indexDocumentId);
    }
  }

  return sections.filter((section) => matchedIndexDocumentIds.has(section.indexDocumentId));
};

const toRawStructureIndexDocumentId = (
  value: unknown,
  sourceUrl: string,
  expectedStdNum: string,
): string | undefined => {
  if (!asSoftRecord(value)) return undefined;
  const indexDocumentId = toStringValue(value.documentId);
  const stdNum = toStringValue(value.stdNum);
  if (indexDocumentId === undefined || stdNum === undefined) return undefined;
  if (stdNum !== expectedStdNum) {
    throw sourceChanged(sourceUrl, "Standard structure row stdNum does not match the request.");
  }
  return indexDocumentId;
};

const toSectionNode = (
  value: unknown,
  sourceUrl: string,
  expectedStdNum: string,
): StandardSectionNode | undefined => {
  if (!asSoftRecord(value)) return undefined;
  const indexDocumentId = toRawStructureIndexDocumentId(value, sourceUrl, expectedStdNum);
  const title = optionalString(value.title);
  const level = optionalNumber(value.level);
  if (indexDocumentId === undefined || title === undefined || level === undefined) {
    return undefined;
  }
  const parentDocumentIds = Array.isArray(value.parentDocumentIds)
    ? value.parentDocumentIds.map(toStringValue).filter((item): item is string => item !== undefined)
    : [];
  const documentType = optionalString(value.documentType);
  const sort = optionalNumber(value.sort);
  return {
    indexDocumentId,
    stdNum: expectedStdNum,
    title,
    ref: optionalString(value.ref) ?? "",
    level,
    parentDocumentIds,
    ...(documentType === undefined ? {} : { documentType }),
    ...(sort === undefined ? {} : { sort }),
  };
};

type ResolvedSectionLookup = {
  readonly indexDocumentId: string;
  readonly sectionEnrichment?: SectionEnrichment;
  readonly ambiguousRef?: boolean;
};

const resolveSectionLookup = async (
  request: GetSectionRequest,
  context: KasbExecutionContext | undefined,
): Promise<ResolvedSectionLookup> => {
  if (request.indexDocumentId !== undefined) {
    return { indexDocumentId: request.indexDocumentId };
  }

  const requestedRef = request.ref;
  if (requestedRef === undefined) {
    throw new ProviderFailure({
      code: "internal_failure",
      message: "Section lookup request has neither indexDocumentId nor ref.",
      retryable: false,
    });
  }

  const snapshot = await fetchStandardStructureSnapshot(request.stdNum, context);
  const sourceUrl = snapshot.sourceUrl;
  const sections = snapshot.sections;

  const matches = sections.filter((section) => normalizeRef(section.ref) === normalizeRef(requestedRef));
  if (matches.length === 0) {
    throw new ProviderFailure({
      code: "not_found",
      message: `Could not find a section for ref ${requestedRef} in standard ${request.stdNum}. Use get-standard-structure to confirm available ref and indexDocumentId values.`,
      retryable: false,
      sourceUrl,
    });
  }

  const selected = [...matches].sort(
    (left, right) => right.level - left.level || (left.sort ?? 0) - (right.sort ?? 0),
  )[0];
  if (selected === undefined) {
    throw sourceChanged(sourceUrl, "Could not normalize the ref section resolution result.");
  }
  return {
    indexDocumentId: selected.indexDocumentId,
    sectionEnrichment: getSectionEnrichmentFromSnapshot(snapshot, selected.indexDocumentId),
    ...(matches.length > 1 ? { ambiguousRef: true } : {}),
  };
};

const normalizeRef = (ref: string): string => ref.replaceAll(/\s+/gu, "");

const getSection: GetSectionProvider["getSection"] = async (request, context) => {
  const lookup = await resolveSectionLookup(request, context);
  const sourceUrl = paragraphsUrl(request.stdNum, lookup.indexDocumentId, request.keyword);
  const payload = asRecord(await fetchKasbJson(sourceUrl, context), sourceUrl, "paragraphs");
  const sourceClauses = asArray(payload.clauses, sourceUrl, "clauses");
  const clauses = sourceClauses
    .map((item) => toSectionClause(item, sourceUrl, request.stdNum, lookup.indexDocumentId))
    .filter((item): item is SectionClause => item !== undefined);
  assertAnyNormalized(sourceClauses, clauses, sourceUrl, "Section paragraph row fields changed.");
  const incomplete = clauses.length !== sourceClauses.length;
  const sectionEnrichment = lookup.sectionEnrichment ?? (await getOptionalSectionEnrichment(request.stdNum, lookup.indexDocumentId, context));

  if (clauses.length === 0 && sectionEnrichment?.exists !== true) {
    if (sectionEnrichment === undefined) {
      await assertSectionExists(request.stdNum, lookup.indexDocumentId, sourceUrl, context);
    } else {
      throw new ProviderFailure({
        code: "not_found",
        message: "Could not find a section for the requested indexDocumentId or ref. Run get-standard-structure and use a returned indexDocumentId. Browser-route titleDocumentId is not allowed in v1.",
        retryable: false,
        sourceUrl,
      });
    }
  }

  const standardTitle = sectionEnrichment?.standardTitle;
  const standardKind = sectionEnrichment?.standardKind;
  const ref = sectionEnrichment?.ref;
  const sectionTitle = optionalString(payload.mainTitle) ?? sectionEnrichment?.title ?? "";
  const level = optionalNumber(payload.mainTitleLevel) ?? sectionEnrichment?.level;
  const sort = optionalNumber(payload.mainTitleSort) ?? sectionEnrichment?.sort;
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
      notes: ["paraContent is a source HTML fragment; fullContent is the normalized plain-text result."],
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
        ? [{ code: "ambiguous_ref_resolved" as const, message: "Multiple sections use the same ref, so the most specific child section was selected." }]
        : []),
      ...(clauses.length === 0 ? [{ code: "empty_section" as const, message: "The section has no paragraphs." }] : []),
      ...(incomplete
        ? [{ code: "partial_clause_normalization" as const, message: "Some section paragraph rows could not be normalized and were omitted." }]
        : []),
    ],
  };
};

const assertSectionExists = async (
  stdNum: string,
  indexDocumentId: string,
  sourceUrl: string,
  context: KasbExecutionContext | undefined,
): Promise<void> => {
  const structureUrl = standardIndexesUrl(stdNum);
  const structure = asRecord(await fetchKasbJson(structureUrl, context), structureUrl, "standard indexes");
  const exists = asArray(structure.standardIndexes, structureUrl, "standardIndexes").some(
    (item) => toRawStructureIndexDocumentId(item, structureUrl, stdNum) === indexDocumentId,
  );
  if (!exists) {
    throw new ProviderFailure({
      code: "not_found",
      message: "Could not find a section for the requested indexDocumentId or ref. Run get-standard-structure and use a returned indexDocumentId. Browser-route titleDocumentId is not allowed in v1.",
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
    throw sourceChanged(sourceUrl, "Section paragraph row stdNum does not match the request.");
  }
  const stdNum = explicitStdNum ?? stdNumFallback;
  const indexDocumentId = explicitIndexDocumentId ?? indexDocumentIdFallback;
  const paraNum = toStringValue(value.paraNum);
  const title = optionalString(value.title);
  const paraContent = optionalString(value.paraContent);
  const sourceFullContent = optionalString(value.fullContent);
  const fullContent = sourceFullContent === undefined
    ? (paraContent === undefined ? undefined : normalizeKasbPlainText(paraContent))
    : normalizeKasbPlainText(sourceFullContent);
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
    throw sourceChanged(sourceUrl, "Could not normalize paragraph identifiers.");
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

const getParagraph: GetParagraphProvider["getParagraph"] = async (request, context) => {
  const sourceUrl = paragraphContentUrl(request.stdNum, request.paraNum);
  const payload = asRecord(await fetchKasbJson(sourceUrl, context), sourceUrl, "paragraph content");
  const paragraphs = asArray(payload.paraContents, sourceUrl, "paraContents");
  if (paragraphs.length === 0) {
    throw new ProviderFailure({
      code: "not_found",
      message: `Could not find paragraph ${request.stdNum}-${request.paraNum}.`,
      retryable: false,
      sourceUrl,
    });
  }
  if (paragraphs.length !== 1) {
    throw sourceChanged(sourceUrl, "Exact paragraph lookup returned multiple rows.");
  }
  const first = paragraphs[0];
  if (first === undefined) {
    throw sourceChanged(sourceUrl, "Exact paragraph lookup result could not be read.");
  }
  const paragraph = toParagraph(first, sourceUrl);
  if (
    paragraph.stdNum !== request.stdNum ||
    paragraph.paraNum !== request.paraNum ||
    paragraph.uniqueKey !== `${request.stdNum}-${request.paraNum}`
  ) {
    throw sourceChanged(sourceUrl, "Paragraph response identifiers do not match the request.");
  }
  const sectionEnrichment = await getOptionalSectionEnrichment(paragraph.stdNum, paragraph.indexDocumentId, context);
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
      notes: ["paraContent is a source HTML fragment; fullContent is the normalized plain-text result."],
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
      : [{ code: "paragraph_metadata_incomplete" as const, message: "Could not fully verify parent standard/section metadata for the paragraph." }],
  };
};

const toParagraph = (value: unknown, sourceUrl: string): Paragraph => {
  const item = asRecord(value, sourceUrl, "paragraph");
  const stdNum = toStringValue(item.stdNum);
  const paraNum = toStringValue(item.paraNum);
  const uniqueKey = toStringValue(item.uniqueKey);
  const indexDocumentId = toStringValue(item.documentId);
  const paraContent = optionalString(item.paraContent);
  const sourceFullContent = optionalString(item.fullContent);
  const fullContent = sourceFullContent === undefined ? undefined : normalizeKasbPlainText(sourceFullContent);
  if (
    stdNum === undefined ||
    paraNum === undefined ||
    uniqueKey === undefined ||
    indexDocumentId === undefined ||
    paraContent === undefined ||
    fullContent === undefined
  ) {
    throw sourceChanged(sourceUrl, "Required paragraph response fields changed.");
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

const searchQna: SearchQnaProvider["search"] = async (request, context) => {
  if (hasQnaRecencyControls(request)) {
    return searchQnaWithRecencyControls(request, context);
  }

  const sourceUrl = qnasSearchUrl({
    searchWord: request.keyword,
    page: request.page,
    rows: request.rows,
    types: request.types,
  });
  const page = await fetchQnaSearchPage(sourceUrl, context);
  const paginationStatus = page.countMetadataIncomplete ? "estimated" : "known";
  const totalCount = page.countMetadataIncomplete
    ? (request.page - 1) * request.rows + page.items.length
    : sumQnaCounts(page.countByType, request.types);
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / request.rows);
  const hasNextPage = !page.countMetadataIncomplete && request.page < totalPages;
  const requestedTypeIds = request.types?.split(",") ?? defaultObservedQnaTypeIds;
  const typeLabels = qnaTypeLabelsFor(new Set([
    ...requestedTypeIds,
    ...Object.keys(page.countByType),
    ...page.items.map((item) => String(item.type)),
  ]));

  return {
    result: {
      request,
      items: page.items,
      returnedCount: page.items.length,
      totalCount,
      totalPages,
      hasNextPage,
      paginationStatus,
      countByType: page.countByType,
      typeLabels,
      suggestedKeywords: suggestBroaderQnaKeywords(request.keyword, totalCount),
    },
    metadata: metadata(sourceUrl, page.incomplete || page.countMetadataIncomplete ? "partial" : "complete", {
      textFields: ["result.items[].title", "result.items[].snippet"],
      notes: ["Search-highlight HTML is normalized to plain text in title and snippet, and snippet is truncated for quick scanning."],
    }),
    references: { searchUrl: sourceUrl },
    warnings: qnaSearchMetadataWarnings(page.incomplete, page.countMetadataIncomplete),
  };
};

type QnaSearchPage = {
  readonly items: readonly QnaSearchItem[];
  readonly incomplete: boolean;
  readonly countByType: Record<string, number>;
  readonly countMetadataIncomplete: boolean;
};

const qnaRecencyScanRows = 50;
const qnaRecencyMaxScanRows = 500;

const hasQnaRecencyControls = (request: SearchQnaRequest): boolean =>
  request.sortDate !== undefined || request.from !== undefined || request.to !== undefined;

const searchQnaWithRecencyControls = async (
  request: SearchQnaRequest,
  context: KasbExecutionContext | undefined,
): Promise<SearchQnaResult> => {
  const firstSourceUrl = qnasSearchUrl({
    searchWord: request.keyword,
    page: 1,
    rows: qnaRecencyScanRows,
    types: request.types,
  });
  const firstPage = await fetchQnaSearchPage(firstSourceUrl, context);
  const sourceTotalCount = firstPage.countMetadataIncomplete
    ? firstPage.items.length
    : sumQnaCounts(firstPage.countByType, request.types);
  const sourcePagesToScan = firstPage.countMetadataIncomplete
    ? 1
    : Math.min(
        Math.ceil(sourceTotalCount / qnaRecencyScanRows),
        Math.ceil(qnaRecencyMaxScanRows / qnaRecencyScanRows),
      );
  const additionalPages = await mapWithConcurrency(
    Array.from({ length: Math.max(0, sourcePagesToScan - 1) }, (_value, index) => index + 2),
    4,
    async (page) => fetchQnaSearchPage(qnasSearchUrl({
      searchWord: request.keyword,
      page,
      rows: qnaRecencyScanRows,
      types: request.types,
    }), context),
  );
  const scannedPages = [firstPage, ...additionalPages];
  const scannedSourceRowCapacity = scannedPages.length * qnaRecencyScanRows;
  const scannedItems = scannedPages.flatMap((page) => [...page.items]);
  const itemsAfterDateControls = applyQnaDateControls(scannedItems, request);
  const offset = (request.page - 1) * request.rows;
  const items = itemsAfterDateControls.slice(offset, offset + request.rows);
  const scannedAllSourceRows = !firstPage.countMetadataIncomplete && scannedSourceRowCapacity >= sourceTotalCount;
  const incomplete = scannedPages.some((page) => page.incomplete);
  const countMetadataIncomplete = firstPage.countMetadataIncomplete || !scannedAllSourceRows;
  const totalCount = itemsAfterDateControls.length;
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / request.rows);
  const countByType = countQnaItemsByType(itemsAfterDateControls);
  const requestedTypeIds = request.types?.split(",") ?? defaultObservedQnaTypeIds;
  const typeLabels = qnaTypeLabelsFor(new Set([
    ...requestedTypeIds,
    ...Object.keys(countByType),
    ...itemsAfterDateControls.map((item) => String(item.type)),
  ]));

  return {
    result: {
      request,
      items,
      returnedCount: items.length,
      totalCount,
      totalPages,
      hasNextPage: request.page < totalPages,
      paginationStatus: countMetadataIncomplete ? "estimated" : "known",
      countByType,
      typeLabels,
      suggestedKeywords: suggestBroaderQnaKeywords(request.keyword, totalCount),
    },
    metadata: metadata(firstSourceUrl, incomplete || countMetadataIncomplete ? "partial" : "complete", {
      textFields: ["result.items[].title", "result.items[].snippet"],
      notes: [
        "Search-highlight HTML is normalized to plain text in title and snippet, and snippet is truncated for quick scanning.",
        `sortDate/from/to are applied client-side to up to ${qnaRecencyMaxScanRows} Q&A search rows using source publishDate.`,
      ],
    }),
    references: { searchUrl: firstSourceUrl },
    warnings: [
      ...qnaSearchMetadataWarnings(incomplete, firstPage.countMetadataIncomplete),
      ...(!scannedAllSourceRows
        ? [{ code: "source_metadata_incomplete" as const, message: `Q&A recency controls were applied to the first ${scannedSourceRowCapacity} rows out of ${sourceTotalCount} source search results.` }]
        : []),
    ],
  };
};

const fetchQnaSearchPage = async (
  sourceUrl: string,
  context: KasbExecutionContext | undefined,
): Promise<QnaSearchPage> => {
  const payload = asRecord(await fetchKasbJson(sourceUrl, context), sourceUrl, "qnas search");
  const sourceItems = asArray(payload.facilityQnas, sourceUrl, "facilityQnas");
  const items = sourceItems
    .map((item) => toQnaSearchItem(item, sourceUrl))
    .filter((item): item is QnaSearchItem => item !== undefined);
  assertAnyNormalized(sourceItems, items, sourceUrl, "Q&A search result fields changed.");
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
  return {
    items,
    incomplete: items.length !== sourceItems.length,
    countByType,
    countMetadataIncomplete,
  };
};

const qnaSearchMetadataWarnings = (
  incomplete: boolean,
  countMetadataIncomplete: boolean,
): Array<{ readonly code: "source_metadata_incomplete"; readonly message: string }> => [
  ...(incomplete
    ? [{ code: "source_metadata_incomplete" as const, message: "Some Q&A search rows could not be normalized and were omitted." }]
    : []),
  ...(countMetadataIncomplete
    ? [{ code: "source_metadata_incomplete" as const, message: "Q&A search count metadata could not be fully normalized, so pagination metadata was computed conservatively." }]
    : []),
];

const applyQnaDateControls = (
  items: readonly QnaSearchItem[],
  request: SearchQnaRequest,
): QnaSearchItem[] => {
  const fromTime = request.from === undefined ? undefined : Date.parse(`${request.from}T00:00:00.000Z`);
  const toTime = request.to === undefined ? undefined : Date.parse(`${request.to}T23:59:59.999Z`);
  const filtered = items.filter((item) => {
    const publishTime = qnaPublishTime(item);
    if (fromTime !== undefined && (publishTime === undefined || publishTime < fromTime)) return false;
    if (toTime !== undefined && (publishTime === undefined || publishTime > toTime)) return false;
    return true;
  });
  const sortDate = request.sortDate;
  if (sortDate === undefined) return filtered;
  return [...filtered].sort((left, right) => compareQnaPublishDate(left, right, sortDate));
};

const compareQnaPublishDate = (
  left: QnaSearchItem,
  right: QnaSearchItem,
  direction: "asc" | "desc",
): number => {
  const leftTime = qnaPublishTime(left);
  const rightTime = qnaPublishTime(right);
  if (leftTime === undefined && rightTime === undefined) return left.docNumber.localeCompare(right.docNumber);
  if (leftTime === undefined) return 1;
  if (rightTime === undefined) return -1;
  const dateOrder = direction === "desc" ? rightTime - leftTime : leftTime - rightTime;
  return dateOrder === 0 ? left.docNumber.localeCompare(right.docNumber) : dateOrder;
};

const qnaPublishTime = (item: QnaSearchItem): number | undefined => {
  if (item.publishDate === undefined) return undefined;
  const time = Date.parse(item.publishDate);
  return Number.isNaN(time) ? undefined : time;
};

const countQnaItemsByType = (items: readonly QnaSearchItem[]): Record<string, number> => {
  const countByType: Record<string, number> = {};
  for (const item of items) {
    const key = String(item.type);
    countByType[key] = (countByType[key] ?? 0) + 1;
  }
  return countByType;
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

const getQna: GetQnaProvider["getQna"] = async (request, context) => {
  const sourceUrl = qnaContentUrl(request.docNumber, request.keyword);
  const payload = asRecord(await fetchKasbJson(sourceUrl, context), sourceUrl, "qna detail");
  const sourceQna = payload.facilityQna;
  if (sourceQna === undefined || sourceQna === null) {
    throw new ProviderFailure({
      code: "not_found",
      message: `Could not find Q&A document ${request.docNumber}.`,
      retryable: false,
      sourceUrl,
    });
  }
  const qna = toQna(sourceQna, sourceUrl);
  if (qna.docNumber !== request.docNumber) {
    throw sourceChanged(sourceUrl, "Q&A response identifier does not match the request.");
  }
  return {
    result: { request, qna },
    metadata: metadata(sourceUrl, "complete", {
      htmlFields: ["result.qna.contentHtml", "result.qna.relStds"],
      textFields: ["result.qna.fullContent"],
      notes: ["contentHtml and relStds are source HTML fragments; fullContent is the source plain-text body."],
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
    throw sourceChanged(sourceUrl, "Required Q&A response fields changed.");
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
