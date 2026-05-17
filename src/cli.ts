import { Command } from "commander";

import { defaultGetParagraphOperation } from "./app/get-paragraph.ts";
import { defaultGetQnaOperation } from "./app/get-qna.ts";
import { defaultGetSectionOperation } from "./app/get-section.ts";
import { defaultGetStandardStructureOperation } from "./app/get-standard-structure.ts";
import { defaultSearchQnasOperation } from "./app/search-qnas.ts";
import { defaultSearchStandardsOperation } from "./app/search-standards.ts";
import type { GetParagraphRawInput, GetParagraphResult } from "./capabilities/get-paragraph/contract.ts";
import type { GetQnaRawInput, GetQnaResult } from "./capabilities/get-qna/contract.ts";
import type { GetSectionRawInput, GetSectionResult } from "./capabilities/get-section/contract.ts";
import type { GetStandardStructureRawInput, GetStandardStructureResult } from "./capabilities/get-standard-structure/contract.ts";
import type { SearchQnasRawInput, SearchQnasResult } from "./capabilities/search-qnas/contract.ts";
import type { SearchStandardsRawInput, SearchStandardsResult } from "./capabilities/search-standards/contract.ts";
import { configureCliTransport, renderCliFailureJson } from "./cli/command-helpers.ts";
import { buildOperationCommand } from "./cli/commands/shared.ts";

const writeStdout = (text: string) => {
  console.log(text);
};

const writeStderr = (text: string) => {
  console.error(text);
};

const shouldPrettyPrintJson = (argv: readonly string[]): boolean => argv.includes("--pretty");

const searchStandardsCommand = buildOperationCommand<
  keyof SearchStandardsRawInput,
  SearchStandardsRawInput,
  SearchStandardsResult
>({
  operationName: defaultSearchStandardsOperation.name,
  summary: "KASB 기준서를 키워드로 검색합니다.",
  description: "KASB 기준서 검색 API(/api/standard)를 호출해 기준서별 검색 건수를 반환합니다.",
  options: [
    { key: "keyword", flags: "--keyword <text>", description: "[필수] 검색어입니다." },
    { key: "limit", flags: "--limit <number>", description: "[기본값: 20] 반환할 기준서 수입니다.", integer: true },
  ],
  examples: [{ description: "리스 관련 기준서를 검색합니다.", argv: ["--keyword", "리스"] }],
  runOperation: (input) => defaultSearchStandardsOperation.execute(input),
  writeStdout,
});

const getStandardStructureCommand = buildOperationCommand<
  keyof GetStandardStructureRawInput,
  GetStandardStructureRawInput,
  GetStandardStructureResult
>({
  operationName: defaultGetStandardStructureOperation.name,
  summary: "기준서의 섹션 구조와 indexDocumentId를 조회합니다.",
  description: "KASB standard-indexes API를 호출해 get-section에 사용할 indexDocumentId 목록을 반환합니다.",
  options: [
    { key: "stdNum", flags: "--std-num <text>", description: "[필수] 기준서 번호입니다. 예: 1116" },
    { key: "keyword", flags: "--keyword <text>", description: "[선택] 구조를 검색어로 필터링합니다." },
  ],
  examples: [{ description: "제1116호 리스 기준서 구조를 조회합니다.", argv: ["--std-num", "1116"] }],
  runOperation: (input) => defaultGetStandardStructureOperation.execute(input),
  writeStdout,
});

const getSectionCommand = buildOperationCommand<
  keyof GetSectionRawInput,
  GetSectionRawInput,
  GetSectionResult
>({
  operationName: defaultGetSectionOperation.name,
  summary: "기준서 섹션을 indexDocumentId로 조회합니다.",
  description: "KASB paragraphs API를 호출해 섹션 제목과 문단 행을 반환합니다.",
  options: [
    { key: "stdNum", flags: "--std-num <text>", description: "[필수] 기준서 번호입니다. 예: 1116" },
    { key: "indexDocumentId", flags: "--index-document-id <text>", description: "[필수] standard-indexes에서 반환된 섹션 검색용 문서 ID입니다." },
    { key: "keyword", flags: "--keyword <text>", description: "[선택] 섹션 문단 하이라이트 검색어입니다." },
  ],
  notes: ["브라우저 경로의 titleDocumentId가 아니라 standard-indexes의 indexDocumentId를 사용합니다."],
  examples: [{ description: "제1116호 목적 섹션을 조회합니다.", argv: ["--std-num", "1116", "--index-document-id", "ZB2hJW"] }],
  runOperation: (input) => defaultGetSectionOperation.execute(input),
  writeStdout,
});

const getParagraphCommand = buildOperationCommand<
  keyof GetParagraphRawInput,
  GetParagraphRawInput,
  GetParagraphResult
>({
  operationName: defaultGetParagraphOperation.name,
  summary: "기준서 문단을 stdNum + paraNum으로 직접 조회합니다.",
  description: "KASB paragraph content API를 호출해 정확한 문단 하나를 반환합니다.",
  options: [
    { key: "stdNum", flags: "--std-num <text>", description: "[필수] 기준서 번호입니다. 예: 1116" },
    { key: "paraNum", flags: "--para-num <text>", description: "[필수] 문단 번호입니다. 예: 23, 한2.1, B3, BC240A" },
  ],
  examples: [{ description: "제1116호 문단 23을 조회합니다.", argv: ["--std-num", "1116", "--para-num", "23"] }],
  runOperation: (input) => defaultGetParagraphOperation.execute(input),
  writeStdout,
});

const searchQnasCommand = buildOperationCommand<
  keyof SearchQnasRawInput,
  SearchQnasRawInput,
  SearchQnasResult
>({
  operationName: defaultSearchQnasOperation.name,
  summary: "KASB Q&A 자료를 키워드로 검색합니다.",
  description: "KASB Q&A API(/api/qnas/v2)를 호출해 질의회신, 신속처리질의, IFRS IC 자료를 검색합니다.",
  options: [
    { key: "keyword", flags: "--keyword <text>", description: "[필수] 검색어입니다." },
    { key: "page", flags: "--page <number>", description: "[기본값: 1] 결과 페이지입니다.", integer: true },
    { key: "rows", flags: "--rows <number>", description: "[기본값: 10] 반환할 Q&A 수입니다(최대 50).", integer: true },
    { key: "types", flags: "--types <csv>", description: "[선택] Q&A 유형 번호 CSV입니다. 기본값: 11,12,13,14,15,24,25" },
  ],
  examples: [{ description: "리스 관련 Q&A를 검색합니다.", argv: ["--keyword", "리스", "--rows", "5"] }],
  runOperation: (input) => defaultSearchQnasOperation.execute(input),
  writeStdout,
});

const getQnaCommand = buildOperationCommand<
  keyof GetQnaRawInput,
  GetQnaRawInput,
  GetQnaResult
>({
  operationName: defaultGetQnaOperation.name,
  summary: "KASB Q&A 문서를 docNumber로 조회합니다.",
  description: "KASB Q&A 상세 API(/api/qnas/v2/{docNumber})를 호출해 문서 본문을 반환합니다.",
  options: [
    { key: "docNumber", flags: "--doc-number <text>", description: "[필수] Q&A 문서 번호입니다. 예: SSI-35629" },
    { key: "keyword", flags: "--keyword <text>", description: "[선택] 원천 API 하이라이트 검색어입니다." },
  ],
  examples: [{ description: "신속처리질의 문서를 조회합니다.", argv: ["--doc-number", "SSI-35629"] }],
  runOperation: (input) => defaultGetQnaOperation.execute(input),
  writeStdout,
});

const rootHelpNotes = `
주의사항:
  - 이 도구는 db.kasb.or.kr의 공개 읽기 API를 호출합니다.
  - 기준서 본문은 /standard/, Q&A 자료는 /qnas/ 화면에서 관찰한 API를 사용합니다.
  - 회계, 법률, 투자 조언을 제공하지 않습니다. 결과는 원문 확인용 구조화 데이터입니다.
`;

const program = configureCliTransport(new Command())
  .name("kasb")
  .description("KASB 기준서와 Q&A 자료를 도구 친화적 JSON으로 조회합니다.")
  .helpOption("-h, --help", "도움말을 표시합니다.")
  .addHelpCommand("help [command]", "명령 도움말을 표시합니다.")
  .addHelpText("after", rootHelpNotes)
  .addCommand(searchStandardsCommand.command)
  .addCommand(getStandardStructureCommand.command)
  .addCommand(getSectionCommand.command)
  .addCommand(getParagraphCommand.command)
  .addCommand(searchQnasCommand.command)
  .addCommand(getQnaCommand.command);

if (process.argv.length <= 2) {
  program.outputHelp();
} else {
  program.parseAsync(process.argv).catch((error) => {
    const cliMessage =
      searchStandardsCommand.renderErrorMessage(error) ??
      getStandardStructureCommand.renderErrorMessage(error) ??
      getSectionCommand.renderErrorMessage(error) ??
      getParagraphCommand.renderErrorMessage(error) ??
      searchQnasCommand.renderErrorMessage(error) ??
      getQnaCommand.renderErrorMessage(error);

    writeStderr(
      renderCliFailureJson(error, {
        ...(cliMessage === undefined ? {} : { message: cliMessage }),
        ...(process.argv[2] === undefined ? {} : { operation: process.argv[2] }),
        pretty: shouldPrettyPrintJson(process.argv),
      }),
    );
    process.exitCode = 1;
  });
}
