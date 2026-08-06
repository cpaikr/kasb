export const kasbApiBaseUrl = "https://db.kasb.or.kr/api" as const;

export const buildKasbApiUrl = (
  path: string,
  params: Record<string, string | number | undefined> = {},
): string => {
  const url = new URL(`${kasbApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
};

export const standardsSearchUrl = (searchWord: string): string =>
  buildKasbApiUrl("/standard", { searchWord });

export const standardIndexesUrl = (
  stdNum: string,
  searchWord?: string,
): string =>
  searchWord === undefined
    ? buildKasbApiUrl(`/standard-indexes/${encodeURIComponent(stdNum)}`)
    : buildKasbApiUrl(`/standard-indexes/${encodeURIComponent(stdNum)}/searchWord`, {
        searchWord,
      });

export const paragraphsUrl = (
  stdNum: string,
  indexDocumentId: string,
  searchWord?: string,
): string =>
  buildKasbApiUrl(
    `/paragraphs/${encodeURIComponent(stdNum)}/${encodeURIComponent(indexDocumentId)}`,
    { searchWord },
  );

export const paragraphContentUrl = (stdNum: string, paraNum: string): string =>
  buildKasbApiUrl(
    `/paragraphs/content/${encodeURIComponent(stdNum)}/${encodeURIComponent(paraNum)}`,
  );

export const qnaTypesDefault = "11,12,13,14,15,24,25";

export const qnasSearchUrl = (input: {
  readonly searchWord: string;
  readonly page: number;
  readonly rows: number;
  readonly types?: string | undefined;
}): string =>
  buildKasbApiUrl("/qnas/v2", {
    types: input.types ?? qnaTypesDefault,
    searchWord: input.searchWord,
    page: input.page,
    rows: input.rows,
  });

export const qnaContentUrl = (docNumber: string, searchWord?: string): string =>
  buildKasbApiUrl(`/qnas/v2/${encodeURIComponent(docNumber)}`, { searchWord });
