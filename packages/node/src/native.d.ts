import type {
  GetParagraphInput,
  GetParagraphResult,
  GetQnaInput,
  GetQnaResult,
  GetSectionInput,
  GetSectionResult,
  GetStandardStructureInput,
  GetStandardStructureResult,
  KasbExecutionContext,
  SearchQnaInput,
  SearchQnaResult,
  SearchStandardsInput,
  SearchStandardsResult,
} from "./index.js";

export declare function searchStandards(input: SearchStandardsInput, context?: KasbExecutionContext): Promise<SearchStandardsResult>;
export declare function getStandardStructure(input: GetStandardStructureInput, context?: KasbExecutionContext): Promise<GetStandardStructureResult>;
export declare function getSection(input: GetSectionInput, context?: KasbExecutionContext): Promise<GetSectionResult>;
export declare function getParagraph(input: GetParagraphInput, context?: KasbExecutionContext): Promise<GetParagraphResult>;
export declare function searchQna(input: SearchQnaInput, context?: KasbExecutionContext): Promise<SearchQnaResult>;
export declare function getQna(input: GetQnaInput, context?: KasbExecutionContext): Promise<GetQnaResult>;
