import {
  searchStandardsInputJsonSchema,
  searchStandardsOperationName,
  searchStandardsResultJsonSchema,
} from "../../kasb-ts/src/capabilities/search-standards/spec.ts";
import {
  getStandardStructureInputJsonSchema,
  getStandardStructureOperationName,
  getStandardStructureResultJsonSchema,
} from "../../kasb-ts/src/capabilities/get-standard-structure/spec.ts";
import {
  getSectionInputJsonSchema,
  getSectionOperationName,
  getSectionResultJsonSchema,
} from "../../kasb-ts/src/capabilities/get-section/spec.ts";
import {
  getParagraphInputJsonSchema,
  getParagraphOperationName,
  getParagraphResultJsonSchema,
} from "../../kasb-ts/src/capabilities/get-paragraph/spec.ts";
import {
  searchQnaInputJsonSchema,
  searchQnaOperationName,
  searchQnaResultJsonSchema,
} from "../../kasb-ts/src/capabilities/search-qna/spec.ts";
import {
  getQnaInputJsonSchema,
  getQnaOperationName,
  getQnaResultJsonSchema,
} from "../../kasb-ts/src/capabilities/get-qna/spec.ts";

import {
  getParagraph,
  getQna,
  getSection,
  getStandardStructure,
  searchQna,
  searchStandards,
} from "./native.js";

export const defaultSearchStandardsOperation = {
  name: searchStandardsOperationName,
  inputJsonSchema: searchStandardsInputJsonSchema,
  resultJsonSchema: searchStandardsResultJsonSchema,
  execute: searchStandards,
};

export const defaultGetStandardStructureOperation = {
  name: getStandardStructureOperationName,
  inputJsonSchema: getStandardStructureInputJsonSchema,
  resultJsonSchema: getStandardStructureResultJsonSchema,
  execute: getStandardStructure,
};

export const defaultGetSectionOperation = {
  name: getSectionOperationName,
  inputJsonSchema: getSectionInputJsonSchema,
  resultJsonSchema: getSectionResultJsonSchema,
  execute: getSection,
};

export const defaultGetParagraphOperation = {
  name: getParagraphOperationName,
  inputJsonSchema: getParagraphInputJsonSchema,
  resultJsonSchema: getParagraphResultJsonSchema,
  execute: getParagraph,
};

export const defaultSearchQnaOperation = {
  name: searchQnaOperationName,
  inputJsonSchema: searchQnaInputJsonSchema,
  resultJsonSchema: searchQnaResultJsonSchema,
  execute: searchQna,
};

export const defaultGetQnaOperation = {
  name: getQnaOperationName,
  inputJsonSchema: getQnaInputJsonSchema,
  resultJsonSchema: getQnaResultJsonSchema,
  execute: getQna,
};
