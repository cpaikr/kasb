use clap::{CommandFactory, error::ErrorKind};
use serde_json::{Map, Value, json};

use crate::args::{Cli, Invocation, OutputMode, is_operation};

pub(crate) const CLI_TRANSPORT_VERSION: &str = "1";

#[derive(Debug, Eq, PartialEq)]
pub struct ProcessOutput {
    pub stdout: Option<String>,
    pub exit_code: i32,
}

impl ProcessOutput {
    pub(crate) fn success(stdout: String) -> Self {
        Self {
            stdout: Some(without_trailing_newlines(stdout)),
            exit_code: 0,
        }
    }

    pub(crate) fn failure(stdout: String) -> Self {
        Self {
            stdout: Some(without_trailing_newlines(stdout)),
            exit_code: 1,
        }
    }

    pub(crate) fn interrupted(exit_code: i32) -> Self {
        Self {
            stdout: None,
            exit_code,
        }
    }
}

pub(crate) fn render_help(error: clap::Error) -> ProcessOutput {
    ProcessOutput::success(error.to_string())
}

pub(crate) fn is_help(error: &clap::Error) -> bool {
    matches!(
        error.kind(),
        ErrorKind::DisplayHelp
            | ErrorKind::DisplayVersion
            | ErrorKind::DisplayHelpOnMissingArgumentOrSubcommand
    )
}

pub(crate) fn render_parse_failure(error: clap::Error, argv: &[String]) -> ProcessOutput {
    let context = ParseContext::new(argv);
    let message = context
        .stable_message(error.kind())
        .unwrap_or_else(|| concise_clap_message(&error));
    let failure = json!({
        "failure": {
            "code": "invalid_input",
            "message": message,
            "recoverable": true,
            "retryable": false,
            "recoveryHint": context.recovery_hint(),
            "recoveryAction": context.recovery_action(),
        },
        "metadata": metadata(context.operation),
        "warnings": [],
    });
    ProcessOutput::failure(render_json(&failure, context.pretty))
}

pub(crate) fn render_typed_failure(
    failure: &kasb::KasbFailure,
    invocation: &Invocation,
) -> ProcessOutput {
    let parameter = failure.parameter.as_deref();
    let used_option = parameter.and_then(|key| invocation.used_options.get(key).copied());
    let mut message = localize_typed_message(
        &failure.message,
        invocation.operation.as_str(),
        parameter,
        used_option,
    );
    let next_action = failure_next_action(failure, invocation);
    if let Some(custom_message) = next_action
        .as_ref()
        .and_then(|action| action.get("message"))
        .and_then(Value::as_str)
    {
        message = custom_message.to_owned();
    }

    let mut public_failure = Map::new();
    public_failure.insert("code".to_owned(), json!(failure.code));
    public_failure.insert("message".to_owned(), Value::String(message));
    public_failure.insert(
        "recoverable".to_owned(),
        Value::Bool(failure.code == kasb::KasbFailureCode::InvalidInput),
    );
    public_failure.insert("retryable".to_owned(), Value::Bool(failure.retryable));
    if let Some(parameter) = parameter {
        public_failure.insert("parameter".to_owned(), Value::String(parameter.to_owned()));
    }
    if let Some(option) = used_option {
        public_failure.insert("cliOption".to_owned(), Value::String(option.to_owned()));
    }
    if let Some(source_url) = failure.source_url.as_deref() {
        public_failure.insert("sourceUrl".to_owned(), Value::String(source_url.to_owned()));
    }
    if failure.code == kasb::KasbFailureCode::InvalidInput {
        public_failure.insert(
            "recoveryHint".to_owned(),
            Value::String(match parameter {
                Some(parameter) => format!(
                    "Run kasb help {} to inspect the {parameter} option requirements.",
                    invocation.operation.as_str()
                ),
                None => format!(
                    "Run kasb help {} to inspect this command's options.",
                    invocation.operation.as_str()
                ),
            }),
        );
        public_failure.insert(
            "recoveryAction".to_owned(),
            json!({
                "kind": "inspect_command_help",
                "operationName": invocation.operation.as_str(),
            }),
        );
    }
    if let Some(mut next_action) = next_action {
        next_action
            .as_object_mut()
            .expect("next action is constructed as an object")
            .remove("message");
        public_failure.insert("nextAction".to_owned(), next_action);
    }

    let envelope = json!({
        "failure": public_failure,
        "metadata": metadata(Some(invocation.operation.as_str())),
        "warnings": [],
    });
    ProcessOutput::failure(render_json(&envelope, invocation.failure_pretty))
}

pub(crate) fn render_internal_failure(
    operation: Option<&str>,
    pretty: bool,
    message: &str,
) -> ProcessOutput {
    let envelope = json!({
        "failure": {
            "code": "internal_failure",
            "message": message,
            "recoverable": false,
            "retryable": false,
        },
        "metadata": metadata(operation),
        "warnings": [],
    });
    ProcessOutput::failure(render_json(&envelope, pretty))
}

pub(crate) fn render_success(
    value: Value,
    invocation: &Invocation,
) -> Result<ProcessOutput, &'static str> {
    let projected = project_success(value, invocation.operation.as_str(), invocation.output)?;
    Ok(ProcessOutput::success(render_json(
        &projected,
        invocation.pretty,
    )))
}

fn project_success(
    mut envelope: Value,
    operation: &str,
    output: OutputMode,
) -> Result<Value, &'static str> {
    if operation == "search-standards" {
        add_search_standard_next_commands(&mut envelope)?;
    }
    if output != OutputMode::Summary {
        return Ok(envelope);
    }
    let result = envelope
        .get("result")
        .ok_or("success envelope omitted result")?;
    let summary = match operation {
        "get-standard-structure" => summarize_structure(result)?,
        "get-section" => summarize_section(result)?,
        "search-qna" => summarize_qna_search(result)?,
        "get-qna" => summarize_qna(result)?,
        _ => return Ok(envelope),
    };
    envelope
        .as_object_mut()
        .ok_or("success envelope was not an object")?
        .insert("result".to_owned(), summary);
    Ok(envelope)
}

fn add_search_standard_next_commands(envelope: &mut Value) -> Result<(), &'static str> {
    let standards = envelope
        .get_mut("result")
        .and_then(|value| value.get_mut("standards"))
        .and_then(Value::as_array_mut)
        .ok_or("search standards result omitted standards")?;
    for standard in standards {
        let action = standard
            .get("nextActions")
            .and_then(|value| value.get("getStandardStructure"))
            .ok_or("search standard omitted structure next action")?;
        let operation = action
            .get("operation")
            .and_then(Value::as_str)
            .ok_or("structure next action omitted operation")?
            .to_owned();
        let std_num = action
            .get("input")
            .and_then(|value| value.get("stdNum"))
            .and_then(Value::as_str)
            .ok_or("structure next action omitted stdNum")?
            .to_owned();
        standard
            .as_object_mut()
            .ok_or("search standard was not an object")?
            .insert(
                "nextCommands".to_owned(),
                json!({
                    "getStandardStructure": format!(
                        "kasb {operation} --std-num {} --output summary",
                        shell_quote_cli_arg(&std_num)
                    )
                }),
            );
    }
    Ok(())
}

fn summarize_structure(result: &Value) -> Result<Value, &'static str> {
    let sections = array(result, "sections")?
        .iter()
        .map(|section| {
            select(
                section,
                &["indexDocumentId", "title", "ref", "level", "documentType"],
            )
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(json!({
        "request": field(result, "request")?,
        "returnedCount": field(result, "returnedCount")?,
        "sections": sections,
    }))
}

fn summarize_section(result: &Value) -> Result<Value, &'static str> {
    let clauses = array(result, "clauses")?
        .iter()
        .map(|clause| {
            select(
                clause,
                &["kind", "title", "paraNum", "uniqueKey", "fullContent"],
            )
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(json!({
        "request": field(result, "request")?,
        "section": field(result, "section")?,
        "clauses": clauses,
    }))
}

fn summarize_qna_search(result: &Value) -> Result<Value, &'static str> {
    let items = array(result, "items")?
        .iter()
        .map(|item| {
            let mut value = select(
                item,
                &[
                    "docNumber",
                    "type",
                    "typeLabel",
                    "title",
                    "snippet",
                    "tags",
                    "deprecated",
                    "publishDate",
                    "prefix",
                ],
            )?;
            if let Some(snippet) = value.get("snippet").and_then(Value::as_str) {
                let snippet = truncate_utf16_safely(snippet, 160);
                value
                    .as_object_mut()
                    .expect("selected fields form an object")
                    .insert("snippet".to_owned(), Value::String(snippet));
            }
            Ok(value)
        })
        .collect::<Result<Vec<_>, &'static str>>()?;
    Ok(json!({
        "request": field(result, "request")?,
        "returnedCount": field(result, "returnedCount")?,
        "totalCount": field(result, "totalCount")?,
        "totalPages": field(result, "totalPages")?,
        "hasNextPage": field(result, "hasNextPage")?,
        "paginationStatus": field(result, "paginationStatus")?,
        "countByType": field(result, "countByType")?,
        "typeLabels": field(result, "typeLabels")?,
        "suggestedKeywords": field(result, "suggestedKeywords")?,
        "items": items,
    }))
}

fn summarize_qna(result: &Value) -> Result<Value, &'static str> {
    let qna = result.get("qna").ok_or("Q&A result omitted qna")?;
    let mut qna_summary = select(
        qna,
        &[
            "docNumber",
            "type",
            "typeLabel",
            "title",
            "tags",
            "deprecated",
            "reference",
            "publishDate",
            "prevDocNumber",
            "nextDocNumber",
        ],
    )?;
    let full_content = qna
        .get("fullContent")
        .and_then(Value::as_str)
        .ok_or("Q&A result omitted fullContent")?;
    qna_summary
        .as_object_mut()
        .expect("selected fields form an object")
        .insert(
            "fullContentPreview".to_owned(),
            Value::String(truncate_utf16_safely(full_content, 1_000)),
        );
    Ok(json!({
        "request": field(result, "request")?,
        "qna": qna_summary,
    }))
}

fn field<'a>(value: &'a Value, key: &str) -> Result<&'a Value, &'static str> {
    value
        .get(key)
        .ok_or("summary source omitted a required field")
}

fn array<'a>(value: &'a Value, key: &str) -> Result<&'a Vec<Value>, &'static str> {
    field(value, key)?
        .as_array()
        .ok_or("summary source field was not an array")
}

fn select(value: &Value, keys: &[&str]) -> Result<Value, &'static str> {
    let source = value
        .as_object()
        .ok_or("summary source item was not an object")?;
    let selected = keys
        .iter()
        .filter_map(|key| {
            source
                .get(*key)
                .map(|value| ((*key).to_owned(), value.clone()))
        })
        .collect::<Map<_, _>>();
    Ok(Value::Object(selected))
}

fn failure_next_action(failure: &kasb::KasbFailure, invocation: &Invocation) -> Option<Value> {
    if failure.code != kasb::KasbFailureCode::InvalidInput {
        return None;
    }
    if invocation.operation.as_str() == "get-section"
        && failure.parameter.as_deref() == Some("indexDocumentId")
    {
        let std_num = raw_string(&invocation.input, "stdNum")?;
        return Some(json!({
            "operation": "get-standard-structure",
            "input": { "stdNum": std_num },
            "command": format!(
                "kasb get-standard-structure --std-num {} --output summary",
                shell_quote_cli_arg(std_num)
            ),
            "reason": "get-section requires indexDocumentId or ref. get-standard-structure returns candidate sections and indexDocumentId/ref values for the standard.",
        }));
    }
    if invocation.operation.as_str() == "search-qna" && failure.parameter.as_deref() == Some("rows")
    {
        let keyword = raw_string(&invocation.input, "keyword")?;
        let row_flag = invocation
            .used_options
            .get("rows")
            .copied()
            .unwrap_or("--rows");
        return Some(json!({
            "operation": "search-qna",
            "input": { "keyword": keyword, "rows": 50 },
            "command": format!(
                "kasb search-qna --keyword {} {row_flag} 50 --output summary",
                shell_quote_cli_arg(keyword)
            ),
            "reason": "search-qna can request only 1-50 rows per page. Increase --page to continue retrieving more results.",
        }));
    }
    None
}

fn raw_string<'a>(input: &'a Value, key: &str) -> Option<&'a str> {
    let value = input.get(key)?.as_str()?;
    let value = trim_ecmascript(value);
    (!value.is_empty()).then_some(value)
}

fn localize_typed_message(
    message: &str,
    operation: &str,
    parameter: Option<&str>,
    used_option: Option<&str>,
) -> String {
    let mut value = message
        .replace("Missing required parameter", "Missing required option")
        .replace("Parameter", "Option")
        .replace("parameter", "option");
    for (key, cli_name) in cli_names(operation) {
        let replacement = if Some(*key) == parameter {
            used_option.unwrap_or(cli_name)
        } else {
            cli_name
        };
        value = value.replace(&format!("\"{key}\""), &format!("\"{replacement}\""));
    }
    value
}

fn cli_names(operation: &str) -> &'static [(&'static str, &'static str)] {
    match operation {
        "search-standards" => &[
            ("keyword", "--keyword"),
            ("limit", "--limit"),
            ("sort", "--sort"),
        ],
        "get-standard-structure" => &[("stdNum", "--std-num"), ("keyword", "--keyword")],
        "get-section" => &[
            ("stdNum", "--std-num"),
            ("indexDocumentId", "--index-document-id"),
            ("ref", "--ref"),
            ("keyword", "--keyword"),
        ],
        "get-paragraph" => &[("stdNum", "--std-num"), ("paraNum", "--para-num")],
        "search-qna" => &[
            ("keyword", "--keyword"),
            ("page", "--page"),
            ("rows", "--rows/--limit"),
            ("types", "--types"),
            ("sortDate", "--sort-date"),
            ("from", "--from"),
            ("to", "--to"),
        ],
        "get-qna" => &[("docNumber", "--doc-number"), ("keyword", "--keyword")],
        _ => &[],
    }
}

fn metadata(operation: Option<&str>) -> Value {
    match operation {
        Some(operation) => json!({
            "cliTransportVersion": CLI_TRANSPORT_VERSION,
            "operation": operation,
        }),
        None => json!({ "cliTransportVersion": CLI_TRANSPORT_VERSION }),
    }
}

fn render_json(value: &Value, pretty: bool) -> String {
    if pretty {
        serde_json::to_string_pretty(value)
    } else {
        serde_json::to_string(value)
    }
    .expect("JSON values always serialize")
}

fn without_trailing_newlines(mut value: String) -> String {
    while value.ends_with(['\n', '\r']) {
        value.pop();
    }
    value
}

fn concise_clap_message(error: &clap::Error) -> String {
    error
        .to_string()
        .lines()
        .find(|line| line.trim_start().starts_with("error:"))
        .map(|line| line.trim_start_matches("error:").trim().to_owned())
        .unwrap_or_else(|| "Invalid command input.".to_owned())
}

struct ParseContext<'a> {
    argv: &'a [String],
    operation: Option<&'a str>,
    pretty: bool,
}

impl<'a> ParseContext<'a> {
    fn new(argv: &'a [String]) -> Self {
        let operation = argv
            .get(1)
            .map(String::as_str)
            .filter(|value| is_operation(value));
        Self {
            argv,
            operation,
            pretty: argv.iter().any(|value| value == "--pretty"),
        }
    }

    fn stable_message(&self, kind: ErrorKind) -> Option<String> {
        if matches!(
            kind,
            ErrorKind::InvalidSubcommand | ErrorKind::MissingSubcommand
        ) {
            let command = if self.argv.get(1).is_some_and(|value| value == "help") {
                self.argv.get(2)
            } else {
                self.argv.get(1)
            }?;
            return Some(format!("Unknown command: \"{command}\"."));
        }
        if kind == ErrorKind::UnknownArgument {
            let option = self.unknown_option()?;
            let mut message = format!("Unknown option: \"{option}\".");
            if self.operation.is_some()
                && matches!(option.as_str(), "--query" | "--search-word")
                && operation_options(self.operation.unwrap_or_default())
                    .iter()
                    .any(|known| known == "--keyword")
            {
                message.push_str(" Use --keyword instead.");
            }
            return Some(message);
        }
        if kind == ErrorKind::InvalidValue {
            let value = self.invalid_output_value()?;
            return Some(format!(
                "error: option '--output <mode>' argument '{value}' is invalid. Allowed choices are summary, structured, raw."
            ));
        }
        None
    }

    fn invalid_output_value(&self) -> Option<&str> {
        self.argv.iter().enumerate().find_map(|(index, value)| {
            let candidate = if value == "--output" {
                self.argv.get(index + 1).map(String::as_str)
            } else {
                value.strip_prefix("--output=")
            };
            candidate.filter(|value| !matches!(*value, "summary" | "structured" | "raw"))
        })
    }

    fn unknown_option(&self) -> Option<String> {
        let known = operation_options(self.operation.unwrap_or_default());
        let mut index = if self.operation.is_some() { 2 } else { 1 };
        while let Some(value) = self.argv.get(index) {
            let name = value.split('=').next().unwrap_or(value);
            if matches!(name, "-h" | "--help" | "--pretty") {
                index += 1;
            } else if known.iter().any(|known| known == name) {
                index += if value.contains('=') { 1 } else { 2 };
            } else if name.starts_with('-') {
                return Some(name.to_owned());
            } else {
                index += 1;
            }
        }
        None
    }

    fn recovery_hint(&self) -> String {
        match self.operation {
            Some(operation) => {
                format!("Run kasb help {operation} to inspect this command's options.")
            }
            None => "Run kasb --help to inspect available commands.".to_owned(),
        }
    }

    fn recovery_action(&self) -> Value {
        match self.operation {
            Some(operation) => json!({
                "kind": "inspect_command_help",
                "operationName": operation,
            }),
            None => json!({ "kind": "inspect_tool_help" }),
        }
    }
}

fn operation_options(operation: &str) -> Vec<String> {
    Cli::command()
        .find_subcommand(operation)
        .into_iter()
        .flat_map(clap::Command::get_arguments)
        .filter_map(clap::Arg::get_long)
        .map(|name| format!("--{name}"))
        .collect()
}

fn shell_quote_cli_arg(value: &str) -> String {
    if !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._~:/@%+=,-".contains(&byte))
    {
        return value.to_owned();
    }
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn truncate_utf16_safely(value: &str, max_units: usize) -> String {
    if value.encode_utf16().count() <= max_units {
        return value.to_owned();
    }
    let mut units = 0;
    let mut end = 0;
    for (index, character) in value.char_indices() {
        let next = units + character.len_utf16();
        if next > max_units {
            break;
        }
        units = next;
        end = index + character.len_utf8();
    }
    format!("{}…", trim_ecmascript_end(&value[..end]))
}

fn trim_ecmascript(value: &str) -> &str {
    value.trim_matches(is_ecmascript_whitespace)
}

fn trim_ecmascript_end(value: &str) -> &str {
    value.trim_end_matches(is_ecmascript_whitespace)
}

fn is_ecmascript_whitespace(value: char) -> bool {
    matches!(
        value,
        '\u{0009}'
            | '\u{000A}'
            | '\u{000B}'
            | '\u{000C}'
            | '\u{000D}'
            | '\u{0020}'
            | '\u{00A0}'
            | '\u{1680}'
            | '\u{2000}'
            ..='\u{200A}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202F}'
                | '\u{205F}'
                | '\u{3000}'
                | '\u{FEFF}'
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncation_counts_utf16_without_splitting_a_scalar() {
        let value = format!("{}😀tail", "a".repeat(159));
        assert_eq!(
            truncate_utf16_safely(&value, 160),
            format!("{}…", "a".repeat(159))
        );
    }

    #[test]
    fn display_commands_keep_the_frozen_quoting_form() {
        assert_eq!(shell_quote_cli_arg("1116"), "1116");
        assert_eq!(shell_quote_cli_arg("리스"), "'리스'");
        assert_eq!(shell_quote_cli_arg("a'b"), "'a'\\''b'");
    }
}
