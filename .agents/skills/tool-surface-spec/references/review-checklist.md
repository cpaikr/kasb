# Reusable Tool Package Review Checklist

Use this checklist after reading the target package and the CLI + neutral toolset surface spec.

## Public package surfaces

- [ ] `package.json` defines at least one CLI `bin` when the package is distributed through npm or an equivalent package manager.
- [ ] `package.json` exports `./toolset` with an import target and type declarations when applicable.
- [ ] Build output files referenced by `bin` and `./toolset` entries exist.
- [ ] The README or install docs explain how to run the command as an installed command, explicit executable path, or package-runner command.
- [ ] The package documents required runtime versions for the CLI and SDK.
- [ ] The package does not require Pi extensions or another host-specific adapter for the reusable public contract.

## Neutral toolset SDK

- [ ] `./toolset` exports one clear `create<Name>Toolset()` factory, or the factory name is documented.
- [ ] The toolset exposes stable `id`, `label`, and purpose-only `description` strings.
- [ ] `help()`, `listOperations()`, and `getCommandHelp()` are network-free.
- [ ] `listOperations()` returns stable kebab-case operation names with useful labels and descriptions.
- [ ] Each operation spec includes semantic input schema, result schema, required input keys, examples, limitations, and result summary.
- [ ] `validateInput()` is network-free, rejects unknown/invalid inputs, and returns normalized input for valid examples.
- [ ] Unknown operations return a structured validation failure with `recoverable: true` and `recoveryAction: { kind: "inspect_tool_help" }` or an equivalent machine-readable path.
- [ ] Known validation failures return structured recovery metadata, including `operationName`, relevant `parameter`, `reason`, `expected`, safe `actual`, `exampleInput`, `recoveryHint`, `recoveryAction`, and `recoverable` where applicable.
- [ ] `execute()` runs one operation, accepts normalized inputs, and respects `ToolRunContext.signal` when the runtime supports cancellation.
- [ ] `serializeError()` preserves name, message, code, recoverability, retryability, recovery action, parameter, source URL/reference, recovery hint, and operation name when available.

## Source of truth

- [ ] `<command> --help` exits 0 and prints current command, option, output, and example guidance.
- [ ] Every meaningful subcommand has command-level help.
- [ ] CLI help maps cleanly to toolset operation names and examples.
- [ ] Docs and skills point agents to the CLI's own help and toolset discovery methods instead of duplicating a stale manual.
- [ ] Help text states output behavior, including JSON stdout and stderr usage.
- [ ] Help examples are current and runnable, or clearly marked as illustrative.

## Operation and command design

- [ ] Operation and subcommand names are stable, host-neutral, and kebab-case where applicable.
- [ ] Inputs use semantic fields/flags instead of raw transport parameters unless source accuracy requires them.
- [ ] CLI flags map to the same validated input object used by the toolset.
- [ ] Unknown or unsafe input shapes are rejected where appropriate.
- [ ] Each operation is one meaningful deterministic action, not a vague prompt wrapper.
- [ ] The command set avoids future adapters, compatibility layers, or broad abstractions before a real user need exists.

## Language and model ergonomics

- [ ] Package, toolset, operation, command, option, help, validation, warning, summary, limitation, and error copy is English-native for agent reliability.
- [ ] Top-level package/toolset descriptions are purpose-only and do not hide invocation instructions in description fields.
- [ ] Official Korean source terms such as `사업보고서`, `감사보고서`, `표준지 공시지가`, and `개별공시지가` are preserved when translation would reduce accuracy.
- [ ] The package does not maintain separate Korean, English, and agent-facing variants for reusable tool definitions; localized UI copy, if needed, belongs to the host application's presentation layer.
- [ ] Help and error recovery guidance preserves concrete usage constraints, source provenance, mutually exclusive-field rules, accepted/rejected identifier types, and cross-command lookup paths.

## Stdout, stderr, and exit codes

- [ ] Successful command execution emits exactly one JSON object to stdout.
- [ ] Command failure emits exactly one JSON failure object to stdout and exits non-zero.
- [ ] Invalid command usage exits non-zero and emits a structured JSON failure object.
- [ ] Stderr is not required to parse results; important warnings are also represented in stdout JSON.
- [ ] Progress/debug diagnostics on stderr are predictable and do not duplicate source-owned errors in a confusing way.

## Success result envelope

- [ ] Success JSON includes a clear success marker such as `ok: true` or an equivalent stable shape.
- [ ] Operation-specific data is kept under a clear result payload such as `result`.
- [ ] Normalized input, command name, or request context is included when useful for replay and auditability.
- [ ] Results preserve references, metadata, warnings, and source context when relevant.
- [ ] The result is useful for the next agent step without extra browsing.
- [ ] Important claims can be cited or revisited through references.

## Failure and recovery envelope

- [ ] Failure JSON and toolset validation results include a clear failure marker such as `ok: false` or an equivalent stable shape.
- [ ] Failures include a structured `error` object or equivalent typed error field.
- [ ] Error metadata includes stable codes, messages, recoverability, retryability, parameter names, expected/actual details, source references, or recovery hints where relevant.
- [ ] Validation failures distinguish input-repair `recoverable` cases from same-input-later `retryable` cases.
- [ ] Validation failures point the model toward `--help`, command-level help, or `getCommandHelp()` through machine-readable `recoveryAction` values.
- [ ] Hosts and adapters do not need to parse localized prose, CLI help text, freeform `message`, or `recoveryHint` to choose a recovery path.
- [ ] Source-owned validation and execution error metadata is preserved instead of rewritten into generic prose.
- [ ] Adapter/process-level errors are distinguishable from source/upstream errors.

## Validation recovery cases

- [ ] Unknown command or operation returns a structured validation failure with `code: "invalid_request"`, `recoverable: true`, and a tool-help recovery action.
- [ ] Non-object input returns a structured validation failure with `code: "invalid_request"`, an expected object shape, and command-help recovery when the operation is known.
- [ ] Missing required parameters return `code: "missing_parameter"`, the missing `parameter`, expected shape, an example input when practical, and command-help recovery.
- [ ] Invalid identifiers or invalid parameter values return `code: "invalid_parameter"`, the failed `parameter`, a concrete `reason`, expected shape, safe actual value when useful, and command-help recovery.
- [ ] Unknown parameters return `code: "unknown_parameter"`, the unexpected `parameter`, valid-shape guidance through `expected` or `exampleInput`, and command-help recovery.

## Capability layering

- [ ] CLI argument parsing stays thin and does not own domain logic.
- [ ] Domain messages, result summaries, validation copy, recovery hints, warnings, and source references live in reusable toolset/capability code behind the CLI.
- [ ] Optional host adapters call the neutral toolset instead of shelling out to the CLI or duplicating capability logic.
- [ ] Behavior is covered by tests at the toolset boundary and CLI boundary.
- [ ] Cancellation/timeouts are handled safely at both the SDK and subprocess boundaries when the runtime supports them.

## Human judgment

- [ ] The schemas or documented output shapes are small enough for model use but complete enough for validation.
- [ ] Limitations are concrete, not boilerplate.
- [ ] Source drift, auth gaps, partial coverage, and known unsupported cases are documented.
- [ ] The toolset/CLI provides source-reference material without overstating legal, accounting, audit, tax, investment, appraisal, or official-government status.
