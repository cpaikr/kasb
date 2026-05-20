import { Command } from "commander";

import { defaultGetParagraphOperation } from "./app/get-paragraph.ts";
import { defaultGetQnaOperation } from "./app/get-qna.ts";
import { defaultGetSectionOperation } from "./app/get-section.ts";
import { defaultGetStandardStructureOperation } from "./app/get-standard-structure.ts";
import { defaultSearchQnaOperation } from "./app/search-qna.ts";
import { defaultSearchStandardsOperation } from "./app/search-standards.ts";
import type { GetParagraphRawInput, GetParagraphResult } from "./capabilities/get-paragraph/contract.ts";
import type { GetQnaRawInput, GetQnaResult } from "./capabilities/get-qna/contract.ts";
import type { GetSectionRawInput, GetSectionResult } from "./capabilities/get-section/contract.ts";
import type { GetStandardStructureRawInput, GetStandardStructureResult } from "./capabilities/get-standard-structure/contract.ts";
import type { SearchQnaRawInput, SearchQnaResult } from "./capabilities/search-qna/contract.ts";
import type { SearchStandardItem, SearchStandardsRawInput, SearchStandardsResult } from "./capabilities/search-standards/contract.ts";
import { configureCliTransport, renderCliFailureJson } from "./cli/command-helpers.ts";
import { buildOperationCommand } from "./cli/commands/shared.ts";

const writeStdout = (text: string) => {
  console.log(text);
};

const writeStderr = (text: string) => {
  console.error(text);
};

const shouldPrettyPrintJson = (argv: readonly string[]): boolean => argv.includes("--pretty");

const detailOutputModes = ["summary", "structured", "raw"] as const;

const truncate = (value: string, maxLength: number): string =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength).trimEnd()}…`;

const renderSearchStandardsCliResult = (output: SearchStandardsResult) => ({
  ...output,
  result: {
    ...output.result,
    standards: output.result.standards.map((standard) => ({
      ...standard,
      nextCommands: renderSearchStandardNextCommands(standard.nextActions),
    })),
  },
});

const renderSearchStandardNextCommands = (nextActions: SearchStandardItem["nextActions"]) => ({
  getStandardStructure: `kasb ${nextActions.getStandardStructure.operation} --std-num ${shellQuoteCliArg(nextActions.getStandardStructure.input.stdNum)} --output summary`,
});

const shellQuoteCliArg = (value: string): string => /^[A-Za-z0-9._~:/@%+=,-]+$/u.test(value)
  ? value
  : `'${value.replaceAll("'", "'\\''")}'`;

const searchStandardsCommand = buildOperationCommand<
  keyof SearchStandardsRawInput,
  SearchStandardsRawInput,
  SearchStandardsResult
>({
  operationName: defaultSearchStandardsOperation.name,
  summary: "KASB 기준서를 키워드로 검색합니다.",
  description: "KASB 기준서 검색 API(/api/standard)를 호출해 기준서별 검색 건수, 기준서 제목(가능한 경우), 넓은 검색어 제안을 반환합니다.",
  options: [
    { key: "keyword", flags: "--keyword <text>", description: "[필수] 검색어입니다." },
    { key: "limit", flags: "--limit <number>", description: "[기본값: 20] 반환할 기준서 수입니다.", integer: true },
    { key: "sort", flags: "--sort <mode>", description: "[기본값: relevance] 정렬입니다: relevance, match-count, std-num, title." },
  ],
  notes: ["기본 relevance 정렬은 원천 API 순서 대신 기준서 제목 매치와 matchCount를 우선합니다.", "정확한 용어로 결과가 좁을 때는 suggestedKeywords 또는 더 넓은 표준명 용어로 다시 검색하세요. 예: 장기종업원급여 → 종업원급여"],
  examples: [{ description: "리스 관련 기준서를 검색합니다.", argv: ["--keyword", "리스"] }],
  projectResult: renderSearchStandardsCliResult,
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
  notes: ["큰 구조 결과는 --output summary로 indexDocumentId, title, ref 중심의 compact JSON을 받을 수 있습니다.", "--keyword는 get-section --ref로 이어질 후보 섹션을 좁힐 때 사용하세요."],
  examples: [
    { description: "제1116호 리스 기준서 구조를 조회합니다.", argv: ["--std-num", "1116"] },
    { description: "리스 검색어로 제1116호 구조에서 적용범위/식별 섹션 후보를 찾습니다.", argv: ["--std-num", "1116", "--keyword", "리스", "--output", "summary"] },
    { description: "수행의무 검색어로 제1115호 구조에서 수행의무 식별 섹션 후보를 찾습니다.", argv: ["--std-num", "1115", "--keyword", "수행의무", "--output", "summary"] },
  ],
  outputModes: detailOutputModes,
  summarizeResult: (output) => ({
    request: output.result.request,
    returnedCount: output.result.returnedCount,
    sections: output.result.sections.map((section) => ({
      indexDocumentId: section.indexDocumentId,
      title: section.title,
      ref: section.ref,
      level: section.level,
      ...(section.documentType === undefined ? {} : { documentType: section.documentType }),
    })),
  }),
  runOperation: (input) => defaultGetStandardStructureOperation.execute(input),
  writeStdout,
});

const getSectionCommand = buildOperationCommand<
  keyof GetSectionRawInput,
  GetSectionRawInput,
  GetSectionResult
>({
  operationName: defaultGetSectionOperation.name,
  summary: "기준서 섹션을 indexDocumentId 또는 ref로 조회합니다.",
  description: "KASB paragraphs API를 호출해 섹션 제목과 문단 행을 반환합니다.",
  options: [
    { key: "stdNum", flags: "--std-num <text>", description: "[필수] 기준서 번호입니다. 예: 1116" },
    { key: "indexDocumentId", flags: "--index-document-id <text>", description: "[선택] get-standard-structure에서 반환된 indexDocumentId입니다. --ref와 정확히 하나만 사용하세요." },
    { key: "ref", flags: "--ref <text>", description: "[선택] 기준서 구조의 ref입니다. --index-document-id를 모를 때만 사용하세요. 예: 153~158, 21.5~21.5의3" },
    { key: "keyword", flags: "--keyword <text>", description: "[선택] 섹션 문단 하이라이트 검색어입니다." },
  ],
  notes: ["--index-document-id 또는 --ref 중 하나가 필요합니다.", "브라우저 경로의 titleDocumentId가 아니라 standard-indexes의 indexDocumentId를 사용합니다.", "ref 범위(예: 9~17, 22~30)는 get-section --ref로 조회하고, 단일 문단은 get-paragraph --para-num으로 조회하세요.", "동일한 ref가 여러 섹션에 있으면 가장 구체적인 하위 섹션을 선택하고 경고를 반환합니다."],
  examples: [
    { description: "제1116호 목적 섹션을 indexDocumentId로 조회합니다.", argv: ["--std-num", "1116", "--index-document-id", "ZB2hJW", "--output", "summary"] },
    { description: "리스 적용범위(ref 3~4)를 조회합니다.", argv: ["--std-num", "1116", "--ref", "3~4", "--output", "summary"] },
    { description: "리스 식별/정의(ref 9~17)를 조회합니다.", argv: ["--std-num", "1116", "--ref", "9~17", "--output", "summary"] },
    { description: "제1019호 장기종업원급여(ref 153~158)를 조회합니다.", argv: ["--std-num", "1019", "--ref", "153~158", "--output", "summary"] },
    { description: "제1115호 수행의무 식별(ref 22~30)을 조회합니다.", argv: ["--std-num", "1115", "--ref", "22~30", "--output", "summary"] },
  ],
  outputModes: detailOutputModes,
  summarizeResult: (output) => ({
    request: output.result.request,
    section: output.result.section,
    clauses: output.result.clauses.map((clause) => ({
      kind: clause.kind,
      ...(clause.title === undefined ? {} : { title: clause.title }),
      ...(clause.paraNum === undefined ? {} : { paraNum: clause.paraNum }),
      ...(clause.uniqueKey === undefined ? {} : { uniqueKey: clause.uniqueKey }),
      ...(clause.fullContent === undefined ? {} : { fullContent: clause.fullContent }),
    })),
  }),
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
  notes: ["문단 범위(예: 9~17, 22~30)는 --para-num이 아니라 get-section --ref로 조회하세요."],
  examples: [
    { description: "제1116호 문단 23을 조회합니다.", argv: ["--std-num", "1116", "--para-num", "23"] },
    { description: "리스 식별 관련 제1116호 문단 9를 직접 조회합니다.", argv: ["--std-num", "1116", "--para-num", "9"] },
  ],
  runOperation: (input) => defaultGetParagraphOperation.execute(input),
  writeStdout,
});

const searchQnaCommand = buildOperationCommand<
  keyof SearchQnaRawInput,
  SearchQnaRawInput,
  SearchQnaResult
>({
  operationName: defaultSearchQnaOperation.name,
  summary: "KASB Q&A 자료를 키워드로 검색합니다.",
  description: "KASB Q&A API(/api/qnas/v2)를 호출해 질의회신, 신속처리질의, IFRS IC 자료를 검색합니다.",
  options: [
    { key: "keyword", flags: "--keyword <text>", description: "[필수] 검색어입니다." },
    { key: "page", flags: "--page <number>", description: "[기본값: 1] 결과 페이지입니다.", integer: true },
    { key: "rows", flags: "--rows <number>", description: "[기본값: 10] 반환할 Q&A 수입니다(최대 50).", integer: true },
    { key: "rows", flags: "--limit <number>", description: "[별칭] --rows와 같습니다.", integer: true },
    { key: "types", flags: "--types <csv>", description: "[선택] 숫자 Q&A 유형 ID CSV입니다. 기본값: 11,12,13,14,15,24,25" },
  ],
  notes: ["--output summary는 외부 contentLink와 긴 source-adjacent 필드를 제외하고 docNumber 중심으로 보여줍니다."],
  examples: [{ description: "리스 관련 Q&A를 검색합니다.", argv: ["--keyword", "리스", "--limit", "5"] }],
  outputModes: detailOutputModes,
  summarizeResult: (output) => ({
    request: output.result.request,
    returnedCount: output.result.returnedCount,
    countByType: output.result.countByType,
    items: output.result.items.map((item) => ({
      docNumber: item.docNumber,
      type: item.type,
      title: item.title,
      snippet: truncate(item.snippet, 240),
      tags: item.tags,
      deprecated: item.deprecated,
      ...(item.publishDate === undefined ? {} : { publishDate: item.publishDate }),
      ...(item.prefix === undefined ? {} : { prefix: item.prefix }),
    })),
  }),
  runOperation: (input) => defaultSearchQnaOperation.execute(input),
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
  notes: ["--output summary는 contentHtml/relStds를 제외하고 본문 preview와 follow-up docNumber만 반환합니다."],
  examples: [{ description: "신속처리질의 문서를 조회합니다.", argv: ["--doc-number", "SSI-35629"] }],
  outputModes: detailOutputModes,
  summarizeResult: (output) => ({
    request: output.result.request,
    qna: {
      docNumber: output.result.qna.docNumber,
      type: output.result.qna.type,
      title: output.result.qna.title,
      fullContentPreview: truncate(output.result.qna.fullContent, 1_000),
      tags: output.result.qna.tags,
      deprecated: output.result.qna.deprecated,
      ...(output.result.qna.reference === undefined ? {} : { reference: output.result.qna.reference }),
      ...(output.result.qna.publishDate === undefined ? {} : { publishDate: output.result.qna.publishDate }),
      ...(output.result.qna.prevDocNumber === undefined ? {} : { prevDocNumber: output.result.qna.prevDocNumber }),
      ...(output.result.qna.nextDocNumber === undefined ? {} : { nextDocNumber: output.result.qna.nextDocNumber }),
    },
  }),
  runOperation: (input) => defaultGetQnaOperation.execute(input),
  writeStdout,
});

const cliCommands = [
  searchStandardsCommand,
  getStandardStructureCommand,
  getSectionCommand,
  getParagraphCommand,
  searchQnaCommand,
  getQnaCommand,
] as const;

const renderCommandErrorMessage = (operationName: string | undefined, error: unknown): string | undefined => {
  const scopedCommand = cliCommands.find((item) => item.command.name() === operationName);
  return scopedCommand?.renderErrorMessage(error);
};

const rootHelpNotes = `
워크플로:
  # 기준서 검색 → 구조 확인 → 섹션 조회
  kasb search-standards --keyword 리스 --limit 40
  kasb get-standard-structure --std-num 1116 --output summary
  kasb get-section --std-num 1116 --ref 9~17 --output summary

  # 정확한 문단 직접 조회
  kasb get-paragraph --std-num 1116 --para-num 23

  # Q&A 검색 → 문서 조회
  kasb search-qna --keyword 리스 --limit 5 --output summary
  kasb get-qna --doc-number SSI-35629 --output summary

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
  .addCommand(searchQnaCommand.command)
  .addCommand(getQnaCommand.command);

if (process.argv.length <= 2) {
  program.outputHelp();
} else {
  program.parseAsync(process.argv).catch((error) => {
    const operationName = process.argv[2];
    const cliMessage = renderCommandErrorMessage(operationName, error);

    writeStderr(
      renderCliFailureJson(error, {
        ...(cliMessage === undefined ? {} : { message: cliMessage }),
        ...(operationName === undefined ? {} : { operation: operationName }),
        pretty: shouldPrettyPrintJson(process.argv),
      }),
    );
    process.exitCode = 1;
  });
}
