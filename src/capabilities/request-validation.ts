import { InvalidCapabilityRequest } from "./types.ts";

export function assertObjectInput(
  input: unknown,
): asserts input is Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new InvalidCapabilityRequest({
      parameter: "input",
      message: "Input must be an object containing semantic parameters.",
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
  const base = `Unknown parameter: "${key}".`;
  const suggestion = suggestAllowedKey(key, allowedKeys);
  if (suggestion !== undefined) {
    return `${base} This typed API uses the JSON field "${suggestion}".`;
  }
  if (key === "titleDocumentId" && allowedKeys.has("indexDocumentId")) {
    return `${base} titleDocumentId is a browser-route id and cannot be used. Use the indexDocumentId returned by get-standard-structure.`;
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
  limit: "rows",
  query: "keyword",
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
      message: `Missing required parameter "${key}".`,
    });
  }
  if (typeof value !== "string") {
    throw new InvalidCapabilityRequest({
      parameter: key,
      message: `Parameter "${key}" must be a string.`,
    });
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvalidCapabilityRequest({
      parameter: key,
      message: `Parameter "${key}" cannot be blank.`,
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
      message: `Parameter "${key}" must be a string.`,
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
      message: `Parameter "${key}" must be an integer.`,
    });
  }
  const numericValue = value as number;
  if (numericValue < options.min || numericValue > options.max) {
    throw new InvalidCapabilityRequest({
      parameter: key,
      message: `Parameter "${key}" must be between ${options.min} and ${options.max}.`,
    });
  }
  return numericValue;
};
