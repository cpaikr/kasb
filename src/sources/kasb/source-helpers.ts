import { ProviderFailure } from "../../capabilities/types.ts";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const asRecord = (
  value: unknown,
  sourceUrl: string,
  context: string,
): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw sourceChanged(sourceUrl, `${context} 응답 객체를 찾을 수 없습니다.`);
  }
  return value;
};

export const asArray = (
  value: unknown,
  sourceUrl: string,
  context: string,
): readonly unknown[] => {
  if (!Array.isArray(value)) {
    throw sourceChanged(sourceUrl, `${context} 배열을 찾을 수 없습니다.`);
  }
  return value;
};

export const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

export const optionalNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

export const toStringValue = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
};

export const sourceChanged = (sourceUrl: string, message: string): ProviderFailure =>
  new ProviderFailure({
    code: "source_changed",
    message,
    retryable: false,
    sourceUrl,
  });

export const stripHtml = (value: string): string =>
  decodeHtmlEntities(removeHtmlTags(value, " "))
    .replace(/\s+/gu, " ")
    .trim();

export const normalizeKasbPlainText = (value: string): string =>
  separateListMarkers(decodeHtmlEntities(removeHtmlTags(value, "\n")))
    .replace(/[\t\f\v ]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();

const blockHtmlTagPattern = /<\s*\/?\s*(?:br|div|p|li|ul|ol|table|thead|tbody|tr|td|th|h[1-6])(?:\s+[^>]*)?\s*\/?>/giu;

const removeHtmlTags = (value: string, blockReplacement: string): string =>
  value
    .replace(blockHtmlTagPattern, blockReplacement)
    .replace(/<[^>]*>/gu, " ");

const decodeHtmlEntities = (value: string): string =>
  value
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/&#x([0-9a-f]+);/giu, (_match, codePoint: string) => decodeCodePoint(Number.parseInt(codePoint, 16)))
    .replace(/&#(\d+);/gu, (_match, codePoint: string) => decodeCodePoint(Number.parseInt(codePoint, 10)));

const decodeCodePoint = (codePoint: number): string => {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return "";
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return "";
  }
};

const listMarkerPattern = String.raw`(?:\((?:\d{1,3}|[가-힣ㄱ-ㅎA-Za-z]|[ivxlcdmIVXLCDM]{1,6})\)|[①-⑳㈀-㈞㉠-㉭])`;
const listMarkerAfterSentencePattern = new RegExp(`([.!?。．])\\s*(${listMarkerPattern})`, "gu");
const listMarkerWithoutSpacingPattern = new RegExp(`(^|\\n)[\\t\\f\\v ]*(${listMarkerPattern})(?=\\S)`, "gu");

const separateListMarkers = (value: string): string =>
  value
    .replace(listMarkerAfterSentencePattern, "$1\n$2")
    .replace(listMarkerWithoutSpacingPattern, "$1$2 ");
