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
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
