import {
  searchStandardsInputJsonSchema,
  searchStandardsOperationName,
  searchStandardsResultJsonSchema,
} from "./capabilities/search-standards/spec.ts";
import {
  getStandardStructureInputJsonSchema,
  getStandardStructureOperationName,
  getStandardStructureResultJsonSchema,
} from "./capabilities/get-standard-structure/spec.ts";
import {
  getSectionInputJsonSchema,
  getSectionOperationName,
  getSectionResultJsonSchema,
} from "./capabilities/get-section/spec.ts";
import {
  getParagraphInputJsonSchema,
  getParagraphOperationName,
  getParagraphResultJsonSchema,
} from "./capabilities/get-paragraph/spec.ts";
import {
  searchQnaInputJsonSchema,
  searchQnaOperationName,
  searchQnaResultJsonSchema,
} from "./capabilities/search-qna/spec.ts";
import {
  getQnaInputJsonSchema,
  getQnaOperationName,
  getQnaResultJsonSchema,
} from "./capabilities/get-qna/spec.ts";

import {
  getParagraph,
  getQna,
  getSection,
  getStandardStructure,
  searchQna,
  searchStandards,
} from "./native.js";

type NodeToolsetOperation = {
  readonly name:
    | "search-standards"
    | "get-standard-structure"
    | "get-section"
    | "get-paragraph"
    | "search-qna"
    | "get-qna";
  readonly inputJsonSchema: unknown;
  readonly resultJsonSchema: unknown;
  readonly execute: (
    input: Record<string, unknown>,
    context?: { readonly signal?: AbortSignal },
  ) => Promise<unknown>;
};

export const defaultSearchStandardsOperation: NodeToolsetOperation = {
  name: searchStandardsOperationName,
  inputJsonSchema: searchStandardsInputJsonSchema,
  resultJsonSchema: searchStandardsResultJsonSchema,
  execute: searchStandards as NodeToolsetOperation["execute"],
};

export const defaultGetStandardStructureOperation: NodeToolsetOperation = {
  name: getStandardStructureOperationName,
  inputJsonSchema: getStandardStructureInputJsonSchema,
  resultJsonSchema: getStandardStructureResultJsonSchema,
  execute: getStandardStructure as NodeToolsetOperation["execute"],
};

export const defaultGetSectionOperation: NodeToolsetOperation = {
  name: getSectionOperationName,
  inputJsonSchema: getSectionInputJsonSchema,
  resultJsonSchema: getSectionResultJsonSchema,
  execute: getSection as NodeToolsetOperation["execute"],
};

export const defaultGetParagraphOperation: NodeToolsetOperation = {
  name: getParagraphOperationName,
  inputJsonSchema: getParagraphInputJsonSchema,
  resultJsonSchema: getParagraphResultJsonSchema,
  execute: getParagraph as NodeToolsetOperation["execute"],
};

export const defaultSearchQnaOperation: NodeToolsetOperation = {
  name: searchQnaOperationName,
  inputJsonSchema: searchQnaInputJsonSchema,
  resultJsonSchema: searchQnaResultJsonSchema,
  execute: searchQna as NodeToolsetOperation["execute"],
};

export const defaultGetQnaOperation: NodeToolsetOperation = {
  name: getQnaOperationName,
  inputJsonSchema: getQnaInputJsonSchema,
  resultJsonSchema: getQnaResultJsonSchema,
  execute: getQna as NodeToolsetOperation["execute"],
};
