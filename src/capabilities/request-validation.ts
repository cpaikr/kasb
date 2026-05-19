import { InvalidCapabilityRequest } from "./types.ts";

export function assertObjectInput(
  input: unknown,
): asserts input is Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new InvalidCapabilityRequest({
      parameter: "input",
      message: "입력은 의미 기반 매개변수를 담은 객체여야 합니다.",
    });
  }
}

export const assertNoUnknownKeys = (
  input: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
): void => {
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) {
      throw new InvalidCapabilityRequest({
        parameter: key,
        message: unknownKeyMessage(key, allowedKeys),
      });
    }
  }
};

const unknownKeyMessage = (key: string, allowedKeys: ReadonlySet<string>): string => {
  const base = `알 수 없는 매개변수입니다: "${key}".`;
  const suggestion = suggestAllowedKey(key, allowedKeys);
  if (suggestion !== undefined) {
    return `${base} 이 typed API는 JSON 필드 "${suggestion}"을(를) 사용합니다.`;
  }
  if (key === "titleDocumentId" && allowedKeys.has("indexDocumentId")) {
    return `${base} titleDocumentId는 브라우저 경로용 ID라서 사용할 수 없습니다. get-standard-structure가 반환한 indexDocumentId를 사용하세요.`;
  }
  return base;
};

const suggestAllowedKey = (key: string, allowedKeys: ReadonlySet<string>): string | undefined => {
  const alias = semanticAliases[key];
  if (alias !== undefined && allowedKeys.has(alias)) return alias;

  const normalizedCandidates = [toCamelCase(key), key.toLowerCase()];
  for (const allowedKey of allowedKeys) {
    if (normalizedCandidates.includes(allowedKey)) return allowedKey;
    if (allowedKey.toLowerCase() === key.toLowerCase()) return allowedKey;
  }
  return undefined;
};

const semanticAliases: Record<string, string> = {
  searchWord: "keyword",
};

const toCamelCase = (key: string): string =>
  key.replace(/[-_]+([a-zA-Z0-9])/gu, (_match, next: string) => next.toUpperCase());

export const readRequiredString = (
  input: Record<string, unknown>,
  key: string,
): string => {
  const value = input[key];
  if (value === undefined) {
    throw new InvalidCapabilityRequest({
      parameter: key,
      message: `필수 매개변수 "${key}"이(가) 없습니다.`,
    });
  }
  if (typeof value !== "string") {
    throw new InvalidCapabilityRequest({
      parameter: key,
      message: `매개변수 "${key}"은(는) 문자열이어야 합니다.`,
    });
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvalidCapabilityRequest({
      parameter: key,
      message: `매개변수 "${key}"은(는) 빈 문자열일 수 없습니다.`,
    });
  }
  return trimmed;
};

export const readOptionalString = (
  input: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = input[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new InvalidCapabilityRequest({
      parameter: key,
      message: `매개변수 "${key}"은(는) 문자열이어야 합니다.`,
    });
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

export const readOptionalInteger = (
  input: Record<string, unknown>,
  key: string,
  options: { readonly defaultValue: number; readonly min: number; readonly max: number },
): number => {
  const value = input[key] ?? options.defaultValue;
  if (!Number.isInteger(value)) {
    throw new InvalidCapabilityRequest({
      parameter: key,
      message: `매개변수 "${key}"은(는) 정수여야 합니다.`,
    });
  }
  const numericValue = value as number;
  if (numericValue < options.min || numericValue > options.max) {
    throw new InvalidCapabilityRequest({
      parameter: key,
      message: `매개변수 "${key}"은(는) ${options.min} 이상 ${options.max} 이하여야 합니다.`,
    });
  }
  return numericValue;
};
