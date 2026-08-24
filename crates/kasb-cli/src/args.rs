use std::collections::BTreeMap;

use clap::{Args, CommandFactory, Parser, Subcommand, ValueEnum};
use serde_json::{Map, Number, Value};

const ROOT_AFTER_HELP: &str = r#"Workflows:
  # Search standards -> inspect structure -> retrieve section
  kasb search-standards --keyword 리스 --limit 40
  kasb get-standard-structure --std-num 1116 --output summary
  kasb get-section --std-num 1116 --ref 9~17 --output summary

  # Retrieve one exact paragraph directly
  kasb get-paragraph --std-num 1116 --para-num 23

  # Search Q&A -> retrieve document
  kasb search-qna --keyword 리스 --limit 5 --output summary
  kasb get-qna --doc-number SSI-35629 --output summary

Cautions:
  - The six KASB content commands perform read-only retrieval from public material.
  - upgrade changes only a receipt-managed standalone CLI installation.
  - It does not provide accounting, legal, investment, or tax advice.
  - Results are structured data for source verification."#;

const SEARCH_STANDARDS_AFTER_HELP: &str = r#"Examples:
  # Search for lease-related standards.
  kasb search-standards --keyword 리스

Notes:
  - The default relevance sort prefers standard title matches and matchCount over source order.
  - If precise terms return narrow results, try suggestedKeywords or broader standard-name terms."#;

const STRUCTURE_AFTER_HELP: &str = r#"Examples:
  # Retrieve the structure for standard 1116 (leases).
  kasb get-standard-structure --std-num 1116

  # Find scope/identification section candidates in standard 1116 for 리스.
  kasb get-standard-structure --std-num 1116 --keyword 리스 --output summary

  # Find performance-obligation candidates in standard 1115 for 수행의무.
  kasb get-standard-structure --std-num 1115 --keyword 수행의무 --output summary

Notes:
  - For large structures, --output summary focuses on indexDocumentId, title, and ref.
  - Use --keyword to narrow candidate sections before get-section --ref."#;

const SECTION_AFTER_HELP: &str = r#"Examples:
  kasb get-section --std-num 1116 --index-document-id ZB2hJW --output summary
  kasb get-section --std-num 1116 --ref 3~4 --output summary
  kasb get-section --std-num 1116 --ref 9~17 --output summary
  kasb get-section --std-num 1019 --ref 153~158 --output summary
  kasb get-section --std-num 1115 --ref 22~30 --output summary

Notes:
  - One of --index-document-id or --ref is required.
  - Use the indexDocumentId returned by get-standard-structure, not a browser-route titleDocumentId.
  - Retrieve ref ranges with get-section --ref; retrieve single paragraphs with get-paragraph --para-num.
  - When sections share a ref, the most specific child is selected and a warning is returned."#;

const PARAGRAPH_AFTER_HELP: &str = r#"Examples:
  kasb get-paragraph --std-num 1116 --para-num 23
  kasb get-paragraph --std-num 1116 --para-num 9

Notes:
  - Retrieve paragraph ranges (for example, 9~17 or 22~30) with get-section --ref, not --para-num."#;

const SEARCH_QNA_AFTER_HELP: &str = r#"Examples:
  kasb search-qna --keyword 리스 --limit 5
  kasb search-qna --keyword 리스 --sort-date desc --limit 10 --output summary

Notes:
  - Q&A types: 11 K-IFRS 회계기준원, 12 일반기업회계기준 회계기준원, 13 K-IFRS IFRS 해석위원회 논의결과, 14 일반기업회계기준 신속처리질의, 15 K-IFRS 신속처리질의, 24 일반기업회계기준 금융감독원, 25 K-IFRS 금융감독원.
  - --sort-date/--from/--to apply client-side publishDate controls to a bounded search window.
  - When no results are found, suggestedKeywords proposes broader terms or spacing variants.
  - --output summary focuses on docNumber and omits long source-adjacent fields."#;

const GET_QNA_AFTER_HELP: &str = r#"Examples:
  kasb get-qna --doc-number SSI-35629

Notes:
  - --output summary excludes preserved HTML fields and returns a body preview plus adjacent docNumber values."#;

#[derive(Debug, Parser)]
#[command(
    name = "kasb",
    about = "Retrieve KASB standards and Q&A material as tool-friendly JSON.",
    version,
    after_help = ROOT_AFTER_HELP,
    arg_required_else_help = true,
    args_override_self = true,
    color = clap::ColorChoice::Never
)]
pub(crate) struct Cli {
    #[command(subcommand)]
    command: Operation,
}

#[derive(Debug, Subcommand)]
enum Operation {
    /// Search KASB standards by keyword.
    #[command(after_help = SEARCH_STANDARDS_AFTER_HELP)]
    SearchStandards(SearchStandardsArgs),
    /// Retrieve a standard's section structure and indexDocumentId values.
    #[command(after_help = STRUCTURE_AFTER_HELP)]
    GetStandardStructure(GetStandardStructureArgs),
    /// Retrieve a standard section by indexDocumentId or ref.
    #[command(after_help = SECTION_AFTER_HELP)]
    GetSection(GetSectionArgs),
    /// Retrieve a standard paragraph directly by stdNum + paraNum.
    #[command(after_help = PARAGRAPH_AFTER_HELP)]
    GetParagraph(GetParagraphArgs),
    /// Search KASB Q&A material by keyword.
    #[command(after_help = SEARCH_QNA_AFTER_HELP)]
    SearchQna(Box<SearchQnaArgs>),
    /// Retrieve a KASB Q&A document by docNumber.
    #[command(after_help = GET_QNA_AFTER_HELP)]
    GetQna(GetQnaArgs),
    /// Check or apply a managed standalone CLI upgrade.
    Upgrade(UpgradeArgs),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum OperationName {
    SearchStandards,
    GetStandardStructure,
    GetSection,
    GetParagraph,
    SearchQna,
    GetQna,
    Upgrade,
}

impl OperationName {
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::SearchStandards => "search-standards",
            Self::GetStandardStructure => "get-standard-structure",
            Self::GetSection => "get-section",
            Self::GetParagraph => "get-paragraph",
            Self::SearchQna => "search-qna",
            Self::GetQna => "get-qna",
            Self::Upgrade => "upgrade",
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, ValueEnum)]
pub(crate) enum OutputMode {
    Summary,
    #[default]
    Structured,
    Raw,
}

#[derive(Debug, Args)]
#[command(arg_required_else_help = true)]
struct SearchStandardsArgs {
    #[arg(
        long,
        value_name = "text",
        allow_hyphen_values = true,
        help = "[required] Search keyword."
    )]
    keyword: Option<String>,
    #[arg(
        long,
        value_name = "number",
        value_parser = parse_integer,
        allow_hyphen_values = true,
        help = "[default: 20] Number of standards to return."
    )]
    limit: Option<ParsedInteger>,
    #[arg(
        long,
        value_name = "mode",
        allow_hyphen_values = true,
        help = "[default: relevance] Sort: relevance, match-count, std-num, title."
    )]
    sort: Option<String>,
    #[arg(long, help = "Print indented JSON for human reading.")]
    pretty: bool,
}

#[derive(Debug, Args)]
#[command(arg_required_else_help = true)]
struct GetStandardStructureArgs {
    #[arg(
        long,
        value_name = "text",
        allow_hyphen_values = true,
        help = "[required] Standard number. Example: 1116"
    )]
    std_num: Option<String>,
    #[arg(
        long,
        value_name = "text",
        allow_hyphen_values = true,
        help = "[optional] Filter the structure by keyword."
    )]
    keyword: Option<String>,
    #[arg(
        long,
        value_name = "mode",
        value_enum,
        allow_hyphen_values = true,
        help = output_help()
    )]
    output: Option<OutputMode>,
    #[arg(long, help = "Print indented JSON for human reading.")]
    pretty: bool,
}

#[derive(Debug, Args)]
#[command(arg_required_else_help = true)]
struct GetSectionArgs {
    #[arg(
        long,
        value_name = "text",
        allow_hyphen_values = true,
        help = "[required] Standard number. Example: 1116"
    )]
    std_num: Option<String>,
    #[arg(
        long,
        value_name = "text",
        allow_hyphen_values = true,
        help = "[optional] indexDocumentId returned by get-standard-structure."
    )]
    index_document_id: Option<String>,
    #[arg(
        long,
        value_name = "text",
        allow_hyphen_values = true,
        help = "[optional] ref from the standard structure."
    )]
    r#ref: Option<String>,
    #[arg(
        long,
        value_name = "text",
        allow_hyphen_values = true,
        help = "[optional] Section highlight keyword."
    )]
    keyword: Option<String>,
    #[arg(
        long,
        value_name = "mode",
        value_enum,
        allow_hyphen_values = true,
        help = output_help()
    )]
    output: Option<OutputMode>,
    #[arg(long, help = "Print indented JSON for human reading.")]
    pretty: bool,
}

#[derive(Debug, Args)]
#[command(arg_required_else_help = true)]
struct GetParagraphArgs {
    #[arg(
        long,
        value_name = "text",
        allow_hyphen_values = true,
        help = "[required] Standard number. Example: 1116"
    )]
    std_num: Option<String>,
    #[arg(
        long,
        value_name = "text",
        allow_hyphen_values = true,
        help = "[required] Paragraph number. Examples: 23, 한2.1, B3, BC240A"
    )]
    para_num: Option<String>,
    #[arg(long, help = "Print indented JSON for human reading.")]
    pretty: bool,
}

#[derive(Debug, Args)]
#[command(arg_required_else_help = true)]
struct SearchQnaArgs {
    #[arg(
        long,
        value_name = "text",
        allow_hyphen_values = true,
        help = "[required] Search keyword."
    )]
    keyword: Option<String>,
    #[arg(
        long,
        value_name = "number",
        value_parser = parse_integer,
        allow_hyphen_values = true,
        help = "[default: 1] Result page."
    )]
    page: Option<ParsedInteger>,
    #[arg(
        long,
        value_name = "number",
        value_parser = parse_integer,
        allow_hyphen_values = true,
        help = "[default: 10] Number of Q&A rows to return (max 50)."
    )]
    rows: Option<ParsedInteger>,
    #[arg(
        long,
        value_name = "number",
        value_parser = parse_integer,
        allow_hyphen_values = true,
        help = "[alias] Same as --rows."
    )]
    limit: Option<ParsedInteger>,
    #[arg(
        long,
        value_name = "csv",
        allow_hyphen_values = true,
        help = "[optional] Numeric Q&A type id CSV. Default: 11,12,13,14,15,24,25"
    )]
    types: Option<String>,
    #[arg(
        long,
        value_name = "direction",
        allow_hyphen_values = true,
        help = "[optional] Client-side publishDate sort: desc, asc."
    )]
    sort_date: Option<String>,
    #[arg(
        long,
        value_name = "yyyy-mm-dd",
        allow_hyphen_values = true,
        help = "[optional] Inclusive publishDate start date."
    )]
    from: Option<String>,
    #[arg(
        long,
        value_name = "yyyy-mm-dd",
        allow_hyphen_values = true,
        help = "[optional] Inclusive publishDate end date."
    )]
    to: Option<String>,
    #[arg(
        long,
        value_name = "mode",
        value_enum,
        allow_hyphen_values = true,
        help = output_help()
    )]
    output: Option<OutputMode>,
    #[arg(long, help = "Print indented JSON for human reading.")]
    pretty: bool,
}

#[derive(Debug, Args)]
#[command(arg_required_else_help = true)]
struct GetQnaArgs {
    #[arg(
        long,
        value_name = "text",
        allow_hyphen_values = true,
        help = "[required] Q&A document number. Example: SSI-35629"
    )]
    doc_number: Option<String>,
    #[arg(
        long,
        value_name = "text",
        allow_hyphen_values = true,
        help = "[optional] Highlight keyword."
    )]
    keyword: Option<String>,
    #[arg(
        long,
        value_name = "mode",
        value_enum,
        allow_hyphen_values = true,
        help = output_help()
    )]
    output: Option<OutputMode>,
    #[arg(long, help = "Print indented JSON for human reading.")]
    pretty: bool,
}

#[derive(Debug, Args)]
struct UpgradeArgs {
    /// Check the latest immutable release without changing the installation.
    #[arg(long)]
    check: bool,
}

#[derive(Debug)]
pub(crate) struct Invocation {
    pub operation: OperationName,
    pub input: Value,
    pub output: OutputMode,
    pub pretty: bool,
    pub failure_pretty: bool,
    pub used_options: BTreeMap<&'static str, &'static str>,
    pub upgrade_check: bool,
}

impl Cli {
    pub(crate) fn into_invocation(self) -> Invocation {
        match self.command {
            Operation::SearchStandards(args) => {
                let mut input = Map::new();
                let mut used = BTreeMap::new();
                insert_string(&mut input, &mut used, "keyword", "--keyword", args.keyword);
                insert_integer(&mut input, &mut used, "limit", "--limit", args.limit);
                insert_string(&mut input, &mut used, "sort", "--sort", args.sort);
                Invocation::new(
                    OperationName::SearchStandards,
                    input,
                    None,
                    args.pretty,
                    used,
                )
            }
            Operation::GetStandardStructure(args) => {
                let mut input = Map::new();
                let mut used = BTreeMap::new();
                insert_string(&mut input, &mut used, "stdNum", "--std-num", args.std_num);
                insert_string(&mut input, &mut used, "keyword", "--keyword", args.keyword);
                Invocation::new(
                    OperationName::GetStandardStructure,
                    input,
                    args.output,
                    args.pretty,
                    used,
                )
            }
            Operation::GetSection(args) => {
                let mut input = Map::new();
                let mut used = BTreeMap::new();
                insert_string(&mut input, &mut used, "stdNum", "--std-num", args.std_num);
                insert_string(
                    &mut input,
                    &mut used,
                    "indexDocumentId",
                    "--index-document-id",
                    args.index_document_id,
                );
                insert_string(&mut input, &mut used, "ref", "--ref", args.r#ref);
                insert_string(&mut input, &mut used, "keyword", "--keyword", args.keyword);
                Invocation::new(
                    OperationName::GetSection,
                    input,
                    args.output,
                    args.pretty,
                    used,
                )
            }
            Operation::GetParagraph(args) => {
                let mut input = Map::new();
                let mut used = BTreeMap::new();
                insert_string(&mut input, &mut used, "stdNum", "--std-num", args.std_num);
                insert_string(
                    &mut input,
                    &mut used,
                    "paraNum",
                    "--para-num",
                    args.para_num,
                );
                Invocation::new(OperationName::GetParagraph, input, None, args.pretty, used)
            }
            Operation::SearchQna(args) => {
                let args = *args;
                let mut input = Map::new();
                let mut used = BTreeMap::new();
                insert_string(&mut input, &mut used, "keyword", "--keyword", args.keyword);
                insert_integer(&mut input, &mut used, "page", "--page", args.page);
                if let Some(limit) = args.limit {
                    insert_integer(&mut input, &mut used, "rows", "--limit", Some(limit));
                } else {
                    insert_integer(&mut input, &mut used, "rows", "--rows", args.rows);
                }
                insert_string(&mut input, &mut used, "types", "--types", args.types);
                insert_string(
                    &mut input,
                    &mut used,
                    "sortDate",
                    "--sort-date",
                    args.sort_date,
                );
                insert_string(&mut input, &mut used, "from", "--from", args.from);
                insert_string(&mut input, &mut used, "to", "--to", args.to);
                Invocation::new(
                    OperationName::SearchQna,
                    input,
                    args.output,
                    args.pretty,
                    used,
                )
            }
            Operation::GetQna(args) => {
                let mut input = Map::new();
                let mut used = BTreeMap::new();
                insert_string(
                    &mut input,
                    &mut used,
                    "docNumber",
                    "--doc-number",
                    args.doc_number,
                );
                insert_string(&mut input, &mut used, "keyword", "--keyword", args.keyword);
                Invocation::new(OperationName::GetQna, input, args.output, args.pretty, used)
            }
            Operation::Upgrade(args) => {
                let mut invocation = Invocation::new(
                    OperationName::Upgrade,
                    Map::new(),
                    None,
                    false,
                    BTreeMap::new(),
                );
                invocation.upgrade_check = args.check;
                invocation
            }
        }
    }
}

impl Invocation {
    fn new(
        operation: OperationName,
        input: Map<String, Value>,
        output: Option<OutputMode>,
        pretty: bool,
        used_options: BTreeMap<&'static str, &'static str>,
    ) -> Self {
        Self {
            operation,
            input: Value::Object(input),
            output: output.unwrap_or_default(),
            pretty,
            failure_pretty: pretty,
            used_options,
            upgrade_check: false,
        }
    }
}

fn insert_string(
    input: &mut Map<String, Value>,
    used: &mut BTreeMap<&'static str, &'static str>,
    key: &'static str,
    option: &'static str,
    value: Option<String>,
) {
    if let Some(value) = value {
        input.insert(key.to_owned(), Value::String(value));
        used.insert(key, option);
    }
}

fn insert_integer(
    input: &mut Map<String, Value>,
    used: &mut BTreeMap<&'static str, &'static str>,
    key: &'static str,
    option: &'static str,
    value: Option<ParsedInteger>,
) {
    if let Some(value) = value {
        input.insert(key.to_owned(), value.0);
        used.insert(key, option);
    }
}

#[derive(Clone, Debug)]
struct ParsedInteger(Value);

fn parse_integer(value: &str) -> Result<ParsedInteger, String> {
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(format!("Expected an integer but received \"{value}\"."));
    }

    // Commander parses digit strings as ECMAScript numbers. Preserve finite
    // overflow as a JSON number for SDK range validation; represent Infinity
    // with a non-number so the SDK still owns integer failure and recovery.
    let parsed = value
        .parse::<f64>()
        .expect("an ASCII digit string always parses as a finite number or infinity");
    Ok(ParsedInteger(
        Number::from_f64(parsed)
            .map(Value::Number)
            .unwrap_or_else(|| Value::String(value.to_owned())),
    ))
}

const fn output_help() -> &'static str {
    "Choose output detail: summary, structured, raw. Default is structured."
}

pub(crate) fn is_operation(value: &str) -> bool {
    Cli::command().find_subcommand(value).is_some()
}
