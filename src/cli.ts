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
import { defaultObservedQnaTypeIds, observedQnaTypeLabels } from "./capabilities/qna-types.ts";
import { configureCliTransport, renderCliFailureJson, type CliErrorDetails } from "./cli/command-helpers.ts";
import { buildOperationCommand } from "./cli/commands/shared.ts";

const writeStdout = (text: string) => {
  console.log(text);
};

const shouldPrettyPrintJson = (argv: readonly string[]): boolean => argv.includes("--pretty");

const detailOutputModes = ["summary", "structured", "raw"] as const;

const qnaDefaultTypesHelpText = defaultObservedQnaTypeIds.join(",");
const qnaTypeHelpNote = `Q&A types: ${Object.entries(observedQnaTypeLabels)
  .map(([type, label]) => `${type} ${label.replace(" · ", " ")}`)
  .join(", ")}.`;

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
  summary: "Search KASB standards by keyword.",
  description: "Calls the KASB standards search API (/api/standard) and returns per-standard hit counts, standard titles when available, and broader keyword suggestions.",
  options: [
    { key: "keyword", flags: "--keyword <text>", description: "[required] Search keyword." },
    { key: "limit", flags: "--limit <number>", description: "[default: 20] Number of standards to return.", integer: true },
    { key: "sort", flags: "--sort <mode>", description: "[default: relevance] Sort mode: relevance, match-count, std-num, title." },
  ],
  notes: ["The default relevance sort prefers standard title matches and matchCount over source API order.", "If precise terms return narrow results, try suggestedKeywords or broader standard-name terms. Example: 장기종업원급여 → 종업원급여"],
  examples: [{ description: "Search for lease-related standards.", argv: ["--keyword", "리스"] }],
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
  summary: "Retrieve a standard's section structure and indexDocumentId values.",
  description: "Calls the KASB standard-indexes API and returns indexDocumentId values usable with get-section.",
  options: [
    { key: "stdNum", flags: "--std-num <text>", description: "[required] Standard number. Example: 1116" },
    { key: "keyword", flags: "--keyword <text>", description: "[optional] Filter the structure by keyword." },
  ],
  notes: ["For large structures, --output summary returns compact JSON focused on indexDocumentId, title, and ref.", "Use --keyword to narrow candidate sections before get-section --ref."],
  examples: [
    { description: "Retrieve the structure for standard 1116 (leases).", argv: ["--std-num", "1116"] },
    { description: "Find scope/identification section candidates in standard 1116 for 리스.", argv: ["--std-num", "1116", "--keyword", "리스", "--output", "summary"] },
    { description: "Find performance-obligation section candidates in standard 1115 for 수행의무.", argv: ["--std-num", "1115", "--keyword", "수행의무", "--output", "summary"] },
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
  summary: "Retrieve a standard section by indexDocumentId or ref.",
  description: "Calls the KASB paragraphs API and returns the section title plus paragraph rows.",
  options: [
    { key: "stdNum", flags: "--std-num <text>", description: "[required] Standard number. Example: 1116" },
    { key: "indexDocumentId", flags: "--index-document-id <text>", description: "[optional] indexDocumentId returned by get-standard-structure. Use exactly one of this and --ref." },
    { key: "ref", flags: "--ref <text>", description: "[optional] ref from the standard structure. Use only when --index-document-id is unknown. Examples: 153~158, 21.5~21.5의3" },
    { key: "keyword", flags: "--keyword <text>", description: "[optional] Section paragraph highlight keyword." },
  ],
  notes: ["One of --index-document-id or --ref is required. If you do not know either, first inspect candidates with get-standard-structure --output summary.", "Use the standard-indexes indexDocumentId, not the browser-route titleDocumentId.", "Retrieve ref ranges (for example, 9~17 or 22~30) with get-section --ref; retrieve single paragraphs with get-paragraph --para-num.", "When multiple sections share a ref, the most specific child section is selected and a warning is returned."],
  examples: [
    { description: "Retrieve the purpose section of standard 1116 by indexDocumentId.", argv: ["--std-num", "1116", "--index-document-id", "ZB2hJW", "--output", "summary"] },
    { description: "Retrieve the lease scope section (ref 3~4).", argv: ["--std-num", "1116", "--ref", "3~4", "--output", "summary"] },
    { description: "Retrieve the lease identification/definition section (ref 9~17).", argv: ["--std-num", "1116", "--ref", "9~17", "--output", "summary"] },
    { description: "Retrieve long-term employee benefits in standard 1019 (ref 153~158).", argv: ["--std-num", "1019", "--ref", "153~158", "--output", "summary"] },
    { description: "Retrieve performance obligation identification in standard 1115 (ref 22~30).", argv: ["--std-num", "1115", "--ref", "22~30", "--output", "summary"] },
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
  renderFailureNextAction: ({ error, rawOptions }) => {
    if (!isInvalidInputForParameter(error, "indexDocumentId")) return undefined;
    const stdNum = readRawStringOption(rawOptions, "stdNum");
    if (stdNum === undefined) return undefined;
    return {
      operation: "get-standard-structure",
      input: { stdNum },
      command: `kasb get-standard-structure --std-num ${shellQuoteCliArg(stdNum)} --output summary`,
      reason: "get-section requires indexDocumentId or ref. get-standard-structure returns candidate sections and indexDocumentId/ref values for the standard.",
    };
  },
  runOperation: (input) => defaultGetSectionOperation.execute(input),
  writeStdout,
});

const getParagraphCommand = buildOperationCommand<
  keyof GetParagraphRawInput,
  GetParagraphRawInput,
  GetParagraphResult
>({
  operationName: defaultGetParagraphOperation.name,
  summary: "Retrieve a standard paragraph directly by stdNum + paraNum.",
  description: "Calls the KASB paragraph content API and returns one exact paragraph.",
  options: [
    { key: "stdNum", flags: "--std-num <text>", description: "[required] Standard number. Example: 1116" },
    { key: "paraNum", flags: "--para-num <text>", description: "[required] Paragraph number. Examples: 23, 한2.1, B3, BC240A" },
  ],
  notes: ["Retrieve paragraph ranges (for example, 9~17 or 22~30) with get-section --ref, not --para-num."],
  examples: [
    { description: "Retrieve paragraph 23 from standard 1116.", argv: ["--std-num", "1116", "--para-num", "23"] },
    { description: "Retrieve paragraph 9 from standard 1116 for lease identification.", argv: ["--std-num", "1116", "--para-num", "9"] },
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
  summary: "Search KASB Q&A material by keyword.",
  description: "Calls the KASB Q&A API (/api/qnas/v2) and searches Q&A, 신속처리질의, and IFRS IC material.",
  options: [
    { key: "keyword", flags: "--keyword <text>", description: "[required] Search keyword." },
    { key: "page", flags: "--page <number>", description: "[default: 1] Result page.", integer: true },
    { key: "rows", flags: "--rows <number>", description: "[default: 10] Number of Q&A rows to return (max 50).", integer: true },
    { key: "rows", flags: "--limit <number>", description: "[alias] Same as --rows.", integer: true },
    { key: "types", flags: "--types <csv>", description: `[optional] Numeric Q&A type id CSV. Default: ${qnaDefaultTypesHelpText}` },
    { key: "sortDate", flags: "--sort-date <direction>", description: "[optional] Client-side publishDate sort: desc, asc." },
    { key: "from", flags: "--from <yyyy-mm-dd>", description: "[optional] Inclusive publishDate start date. Example: 2024-01-01" },
    { key: "to", flags: "--to <yyyy-mm-dd>", description: "[optional] Inclusive publishDate end date. Example: 2024-12-31" },
  ],
  notes: [qnaTypeHelpNote, "--sort-date/--from/--to fetch up to 500 KASB search-result rows and apply client-side publishDate controls.", "When no results are found, suggestedKeywords proposes broader terms or spacing variants.", "--output summary focuses on docNumber and excludes external contentLink plus long source-adjacent fields."],
  examples: [
    { description: "Search lease-related Q&A.", argv: ["--keyword", "리스", "--limit", "5"] },
    { description: "Search lease-related Q&A by recent publishDate.", argv: ["--keyword", "리스", "--sort-date", "desc", "--limit", "10", "--output", "summary"] },
  ],
  outputModes: detailOutputModes,
  summarizeResult: (output) => ({
    request: output.result.request,
    returnedCount: output.result.returnedCount,
    totalCount: output.result.totalCount,
    totalPages: output.result.totalPages,
    hasNextPage: output.result.hasNextPage,
    paginationStatus: output.result.paginationStatus,
    countByType: output.result.countByType,
    typeLabels: output.result.typeLabels,
    suggestedKeywords: output.result.suggestedKeywords,
    items: output.result.items.map((item) => ({
      docNumber: item.docNumber,
      type: item.type,
      typeLabel: item.typeLabel,
      title: item.title,
      snippet: truncate(item.snippet, 160),
      tags: item.tags,
      deprecated: item.deprecated,
      ...(item.publishDate === undefined ? {} : { publishDate: item.publishDate }),
      ...(item.prefix === undefined ? {} : { prefix: item.prefix }),
    })),
  }),
  renderFailureNextAction: ({ error, rawOptions }) => {
    if (!isInvalidInputForParameter(error, "rows")) return undefined;
    const keyword = readRawStringOption(rawOptions, "keyword");
    if (keyword === undefined) return undefined;
    const rowFlag = rawOptions.limit === undefined ? "--rows" : "--limit";
    return {
      operation: "search-qna",
      input: { keyword, rows: 50 },
      command: `kasb search-qna --keyword ${shellQuoteCliArg(keyword)} ${rowFlag} 50 --output summary`,
      reason: "search-qna can request only 1-50 rows per page. Increase --page to continue retrieving more results.",
    };
  },
  runOperation: (input) => defaultSearchQnaOperation.execute(input),
  writeStdout,
});

const getQnaCommand = buildOperationCommand<
  keyof GetQnaRawInput,
  GetQnaRawInput,
  GetQnaResult
>({
  operationName: defaultGetQnaOperation.name,
  summary: "Retrieve a KASB Q&A document by docNumber.",
  description: "Calls the KASB Q&A detail API (/api/qnas/v2/{docNumber}) and returns the document body.",
  options: [
    { key: "docNumber", flags: "--doc-number <text>", description: "[required] Q&A document number. Example: SSI-35629" },
    { key: "keyword", flags: "--keyword <text>", description: "[optional] Source API highlight keyword." },
  ],
  notes: ["--output summary excludes contentHtml/relStds and returns only a body preview plus follow-up docNumber values."],
  examples: [{ description: "Retrieve a 신속처리질의 document.", argv: ["--doc-number", "SSI-35629"] }],
  outputModes: detailOutputModes,
  summarizeResult: (output) => ({
    request: output.result.request,
    qna: {
      docNumber: output.result.qna.docNumber,
      type: output.result.qna.type,
      typeLabel: output.result.qna.typeLabel,
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

const renderCommandErrorDetails = (operationName: string | undefined, error: unknown): CliErrorDetails | undefined => {
  const scopedCommand = cliCommands.find((item) => item.command.name() === operationName);
  return scopedCommand?.renderErrorDetails(error);
};

const isInvalidInputForParameter = (error: unknown, parameter: string): boolean =>
  error !== null &&
  typeof error === "object" &&
  "code" in error &&
  "parameter" in error &&
  (error as { readonly code?: unknown }).code === "invalid_input" &&
  (error as { readonly parameter?: unknown }).parameter === parameter;

const readRawStringOption = (
  rawOptions: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = rawOptions[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const rootHelpNotes = `
Workflows:
  # Search standards → inspect structure → retrieve section
  kasb search-standards --keyword 리스 --limit 40
  kasb get-standard-structure --std-num 1116 --output summary
  kasb get-section --std-num 1116 --ref 9~17 --output summary

  # Retrieve one exact paragraph directly
  kasb get-paragraph --std-num 1116 --para-num 23

  # Search Q&A → retrieve document
  kasb search-qna --keyword 리스 --limit 5 --output summary
  kasb get-qna --doc-number SSI-35629 --output summary

Cautions:
  - This tool calls the public read API at db.kasb.or.kr.
  - It uses APIs observed from the /standard/ screen for standards and the /qnas/ screen for Q&A material.
  - It does not provide accounting, legal, investment, or tax advice. Results are structured data for source verification.
`;

const program = configureCliTransport(new Command())
  .name("kasb")
  .description("Retrieve KASB standards and Q&A material as tool-friendly JSON.")
  .helpOption("-h, --help", "Display help.")
  .addHelpCommand("help [command]", "Display command help.")
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
    const argvCommand = process.argv[2];
    const operationName = cliCommands.some((item) => item.command.name() === argvCommand)
      ? argvCommand
      : undefined;
    const errorDetails = renderCommandErrorDetails(operationName, error);

    writeStdout(
      renderCliFailureJson(error, {
        ...errorDetails,
        ...(operationName === undefined ? {} : { operation: operationName }),
        pretty: shouldPrettyPrintJson(process.argv),
      }),
    );
    process.exitCode = 1;
  });
}
