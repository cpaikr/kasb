# Reusable Tool Package Surface Spec

## Purpose

This spec defines a project-neutral shape for packages that expose deterministic agent-usable capabilities through two required public surfaces:

1. a CLI, and
2. a runtime-neutral TypeScript toolset SDK.

The CLI is the subprocess integration surface. Agents should be able to discover current behavior from the command's own help, run the tool as a subprocess, and consume predictable structured stdout.

The toolset SDK is the in-process integration surface. Host adapters, tests, workflows, and future package-specific integrations should import the same neutral capability contract instead of copying CLI parsing code or reimplementing domain behavior.

This spec does **not** require a Pi adapter or any other host-specific wrapper.

The purpose-only description rule in this spec is intentionally narrow: it applies to top-level package/toolset descriptions. It does not apply to operation-level or parameter-level guidance.

Compatibility is defined at the package surface and outer output-envelope level. Each package still defines its own domain operations and `result` payload schemas.

## Non-goals

- This is not an MCP spec.
- This is not a Pi extension spec.
- This is not a host adapter spec.
- This is not a marketplace/plugin system.
- This does not prescribe one domain `result` payload for every tool family.
- This does not require every host adapter to expose the exact same parameter encoding.

## Required package surfaces

`package.json` should expose both public surfaces explicitly:

```jsonc
{
  "bin": {
    "example-tool": "dist/cli.js"
  },
  "exports": {
    "./toolset": {
      "types": "./dist/toolset.d.ts",
      "import": "./dist/toolset.js"
    }
  }
}
```

Invocation guidance:

- Prefer an installed command when the environment already has one.
- Prefer an explicit executable path when testing a local checkout or build artifact.
- Prefer package-runner commands such as `npx`, `bunx`, or `pnpm dlx` when the package is not installed.
- Document the minimum supported runtime version when the command or SDK needs one.

Naming guidance:

- Use a short stable package/tool id, usually the CLI binary name.
- Use kebab-case canonical operation and subcommand names: `search-company`, `view-report`, `list-items`.
- Keep operation names host-neutral.
- Keep command, option, JSON key, schema property, and export names stable and code-like English.

## Source of truth

The neutral toolset owns operation discovery, validation, execution, structured errors, result metadata, and reusable agent-facing guidance.

The CLI's own help is the authoritative contract for subprocess users:

- `<command> --help` lists available command groups, global options, output behavior, and examples.
- `<command> <subcommand> --help` or equivalent command help lists inputs, mutually exclusive fields, defaults, output shape, examples, limitations, and recovery guidance.
- Documentation may summarize behavior, but it should tell agents to inspect help before running real queries.
- Do not rely on copied manuals inside skills or host prompts when the CLI and toolset can report current behavior themselves.

## Language policy

Reusable agent-tool packages should be **English-native for the agent/control plane**. The package-owned contract is what models, scripts, host adapters, and maintainers use to understand the tool precisely, so keep these surfaces in English:

- toolset, operation, package, and command labels,
- top-level toolset and package descriptions,
- operation descriptions and internal agent-native function tool descriptions,
- `help()` and `getCommandHelp()` prose,
- CLI `--help` and command help text,
- option descriptions and examples,
- validation failure messages, recovery hints, warnings, execution error messages, result summaries, limitations, and citation guidance.

Do not maintain three parallel variants such as Korean, English, and agent-facing copy. The reusable package provides one English model-facing contract. Product hosts own localized UI display copy in their presentation layer when they need localized labels, descriptions, toasts, panels, or dialogs.

Preserve source-native Korean domain terms when they are official identifiers or the terms users and source systems actually use. Do not force awkward translations for terms such as `사업보고서`, `감사보고서`, `반기보고서`, `분기보고서`, `표준지 공시지가`, `개별공시지가`, `법정동`, `공시지가`, and source-specific report or section titles. When a Korean term may be unfamiliar to the model, add a short English gloss on first mention, for example `사업보고서 (annual business report)` or `개별공시지가 (individual publicly announced land price)`.

## Layering model

```text
source/domain adapters -> capability contracts -> neutral toolset -> CLI
                                                        |-> optional host adapters
                                                        |-> future MCP/HTTP/etc.
```

The neutral toolset is the reusable public contract. The CLI parses arguments, calls the toolset, renders the final process result, and exits. Host adapters, when they exist, should also call the toolset. Adapters should not own domain behavior, domain validation copy, reusable agent guidance, or source-specific recovery guidance.

## Compatibility boundary

The compatibility contract is the shared shell that scripts, hosts, and agents can rely on across unrelated packages:

- package `bin` entries and executable build artifacts,
- package `exports["./toolset"]` import target and types,
- toolset identity, help, operation discovery, operation specs, validation, execution, and error serialization methods,
- validation result and serialized error shapes,
- operation spec fields, including each operation's own input and result schemas,
- command and subcommand help behavior,
- stdout/stderr discipline,
- process exit-code semantics,
- structured CLI success and failure JSON envelopes,
- result references, warnings, and metadata when relevant.

The domain contract is intentionally project-specific:

- the specific set of canonical operation names,
- command and operation input fields,
- operation result payloads under `result`,
- references, metadata, warnings, and source-specific fields inside those operation results.

A greenfield package is compatible when it implements the shared shell and documents its own payloads through operation schemas and command help. It does not need to copy another package's operations or payload fields.

## Neutral toolset contract

The `./toolset` export should provide a factory, normally named `create<Name>Toolset()`.

Required runtime shape:

```ts
export type ToolRunContext = {
  readonly signal?: AbortSignal;
};

export type Toolset = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly help: () => ToolsetHelp;
  readonly listOperations: () => readonly OperationSummary[];
  readonly getOperation?: (name: string) => OperationSpec | undefined;
  readonly getCommandHelp: (name: string) => OperationSpec | undefined;
  readonly validateInput: (name: string, input: unknown) => ValidationResult;
  readonly execute: (
    name: string,
    input: Record<string, unknown>,
    context?: ToolRunContext,
  ) => Promise<unknown>;
  readonly serializeError: (error: unknown) => SerializedError;
};
```

Required behavior:

- `label` and `description` are English model-facing strings for the reusable package contract. They may preserve official Korean domain terms when those are the source-native names. The top-level `Toolset.description` is a concise purpose statement: what the toolset is for and, if useful, its evidence/safety posture. Do not put call sequences, action names, parameter hints, or other how-to-use instructions in this field; put those in `help()`, operation specs, prompt snippets, guidelines, parameter descriptions, or internal agent-native function tool descriptions. This purpose-only rule applies to the top-level toolset description, not to every field named `description` elsewhere.
- `help()` is network-free and lists what the toolset can do.
- `listOperations()` is network-free and returns canonical operation summaries.
- `getCommandHelp(name)` is network-free and returns the operation contract.
- `validateInput(name, input)` is network-free and normalizes valid input when possible.
- `execute(name, input, context)` runs one operation, respects `context.signal`, and returns the operation's domain payload as described by that operation's `resultJsonSchema`.
- `serializeError(error)` preserves structured error fields across package and host boundaries.

`execute()` intentionally returns `unknown` at the common interface because operation payloads differ by project and command. Cross-project compatibility comes from operation discovery, schemas, validation, serialized errors, and adapter envelopes, not from forcing one global domain payload.

## Operation spec contract

Each operation should expose:

```ts
export type OperationSpec = {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly inputJsonSchema: unknown;
  readonly resultJsonSchema: unknown;
  readonly requiredInputKeys: readonly string[];
  readonly examples: readonly Record<string, unknown>[];
  readonly limitations: readonly string[];
  readonly resultSummary: string;
};
```

Rules:

- The operation name is the stable cross-adapter identifier.
- Input schemas should describe semantic fields, not raw transport arguments.
- CLI flags may differ from SDK field names when needed for ergonomics, but they should map cleanly to the same validated input object.
- Examples should be valid inputs that can be used by docs, tests, and agent prompts.
- Limitations should state source drift, auth gaps, partial coverage, and known unsupported cases.
- Result schemas should preserve enough structure for downstream automation.
- Operation specs, input JSON Schemas, property and parameter descriptions, `oneOf` branch descriptions, result-field descriptions, recovery hints, prompt snippets, and internal agent-native function tool descriptions may be instructional. Preserve concrete locator provenance, mutually exclusive-field rules, accepted and rejected identifier types, and cross-operation references that help an agent call the operation correctly; do not rewrite them into vague purpose-only copy.
- Internal tools generated from operation specs, such as `example_search_record` or `example_get_section`, may include practical invocation guidance: which identifiers are required, which fields are mutually exclusive, which identifier types are accepted or rejected, where a value came from, and which earlier command returns a required lookup value.

## Validation and error contract

Validation failures should be structured and recoverable:

```ts
export type ValidationRecoveryAction =
  | { readonly kind: "inspect_tool_help" }
  | { readonly kind: "inspect_command_help"; readonly operationName: string };

export type ValidationFailure = {
  readonly code:
    | "missing_parameter"
    | "invalid_parameter"
    | "unknown_parameter"
    | "invalid_request";
  readonly message: string;
  readonly operationName?: string;
  readonly parameter?: string;
  readonly reason?: string;
  readonly expected?: string;
  readonly actual?: unknown;
  readonly exampleInput?: Record<string, unknown>;
  readonly recoveryHint?: string;
  readonly recoveryAction?: ValidationRecoveryAction;
  readonly recoverable: boolean;
  readonly retryable?: boolean;
};

export type ValidationResult =
  | { readonly ok: true; readonly input: Record<string, unknown> }
  | { readonly ok: false; readonly error: ValidationFailure };
```

`recoverable` means a caller can repair the input by following the structured recovery metadata. `retryable` means the same request might succeed later, such as after a transient source, network, rate-limit, or availability issue. Do not mark missing parameters, unknown parameters, malformed identifiers, or non-object input as `retryable` merely because the caller can submit a different request. Existing packages that already use `retryable` to mean input-repairable should document it as a compatibility alias and prefer `recoverable` for new validation failures.

Validation metadata should include the failed `operationName` when known, the failed `parameter` when the failure is field-scoped, a concise `reason`, the `expected` shape, the safe `actual` value when it does not expose secrets or excessive payloads, and an `exampleInput` when one can guide the next call. `recoveryHint` is human/model-facing copy; `recoveryAction` is the machine-readable next step. Hosts and adapters should not parse localized prose, CLI help text, freeform `message`, or `recoveryHint` to decide whether to inspect tool help, inspect command help, repair input, or retry later.

Common validation recovery actions:

- Unknown operation or command: use `code: "invalid_request"`, `recoverable: true`, and `recoveryAction: { kind: "inspect_tool_help" }`.
- Non-object input for a known operation: use `code: "invalid_request"`, `operationName`, `expected`, `recoverable: true`, and `recoveryAction: { kind: "inspect_command_help", operationName }`.
- Missing required parameter: use `code: "missing_parameter"`, `operationName`, `parameter`, `expected`, `exampleInput`, `recoverable: true`, and command-scoped recovery.
- Invalid identifier or invalid parameter value: use `code: "invalid_parameter"`, `operationName`, `parameter`, `reason`, `expected`, safe `actual`, and command-scoped recovery.
- Unknown parameter: use `code: "unknown_parameter"`, `operationName`, `parameter`, `reason`, `expected` or `exampleInput`, and command-scoped recovery.

Execution errors should be serializable:

```ts
export type SerializedError = {
  readonly name: string;
  readonly message: string;
  readonly code?: string;
  readonly recoverable?: boolean;
  readonly retryable?: boolean;
  readonly parameter?: string;
  readonly sourceUrl?: string;
  readonly recoveryHint?: string;
  readonly recoveryAction?: ValidationRecoveryAction;
  readonly operationName?: string;
};
```

Adapters and CLIs should preserve these fields instead of rephrasing them into unstructured prose.

## Result envelope guidance

Domain payloads may vary, but agent-facing operations should generally include:

- `result`: the structured payload,
- `metadata`: source, timing, completeness, version, cache, or parser details,
- `references`: stable ids, URLs, anchors, section ids, page numbers, or source pointers,
- `warnings`: partial results, parsing uncertainty, source drift, fallback use,
- `error`: typed failure when the operation returns an error envelope instead of throwing.

If a package wants to provide host-ready presentation fields or model-readable text for a shared action protocol, expose them from the neutral layer rather than recreating them in every adapter. A source-owned presentation envelope can include:

- `summary`: short source-owned result summary,
- `findings`: compact model-facing highlights,
- `sources`: normalized citation/link records for generic hosts,
- `warnings`: source-owned warning strings,
- `raw` or `result`: the full structured source result.

This presentation envelope is optional; do not force it on tool families whose native result schema is already the right contract. Hosts may derive fallback summaries or source links, but those fallbacks should not replace source-owned fields when present.

Traceability is a contract feature. If a result cannot be cited, revisited, or recovered from, it is usually not ready for agent workflows.

## CLI contract

The CLI should be a thin adapter over the same neutral toolset operations.

Required behavior:

- `--help` exits 0 and prints human-readable English help text for agents and developers, while preserving official Korean source terms where accuracy requires them.
- Command-level help is available for every meaningful subcommand.
- Successful command execution prints exactly one JSON response object to stdout.
- Command failure prints exactly one JSON failure object to stdout and exits non-zero.
- Stderr does not contain data needed to parse the command result. Use stderr only for diagnostics, progress, debug logs, or warnings that are also preserved in stdout JSON when they matter.
- Invalid commands, invalid options, validation failures, upstream/source failures, and unexpected execution failures are distinguishable in structured output.
- The CLI should not hide structured validation or execution errors that the neutral toolset exposes.
- CLI examples should match operation examples where practical.

Recommended behavior:

- Provide a `--pretty` flag for manual debugging while keeping stdout a single JSON object.
- Provide a safe no-network or low-cost command that can be used as a success smoke test when practical.
- Keep flags semantic and stable; avoid exposing raw transport parameters unless the source system requires them.
- Include machine-readable result metadata such as source name, request identifiers, parser version, timing, cache status, or completeness when useful.

## CLI output envelope guidance

Success envelopes should generally look like this:

```jsonc
{
  "ok": true,
  "command": "search-company",
  "input": { "normalized": "values actually used" },
  "result": { "domain": "payload" },
  "metadata": { "source": "source name or version" },
  "references": [],
  "warnings": []
}
```

Failure envelopes should generally look like this:

```jsonc
{
  "ok": false,
  "command": "search-company",
  "error": {
    "name": "ValidationError",
    "code": "missing_parameter",
    "message": "companyName is required.",
    "parameter": "companyName",
    "expected": "Non-empty company name string.",
    "exampleInput": { "companyName": "Example Corp" },
    "recoverable": true,
    "retryable": false,
    "recoveryAction": {
      "kind": "inspect_command_help",
      "operationName": "search-company"
    },
    "recoveryHint": "Run `example-tool search-company --help` and provide --company-name."
  },
  "metadata": { "source": "cli" },
  "warnings": []
}
```

These exact keys are recommended, not mandatory for every domain. The invariant is that stdout remains one parseable JSON object and preserves enough structured data for an agent to recover or cite the result.

## Message ownership

Source packages should own domain and reusable agent messages:

- operation descriptions and result summaries,
- command descriptions derived from operation specs,
- limitations and citation guidance,
- validation failure messages,
- recoverability, retryability, and recovery hints,
- source warnings and execution error messages,
- shared single-tool action descriptions, prompt snippets, internal agent-native function tool descriptions, and model-facing formatters when more than one adapter can reuse them.

These source-owned messages are model-facing control-plane copy and should be written in English, while preserving source-native Korean terms, machine identifiers, and proper nouns that should not be translated.

Adapters should own only adapter/protocol messages:

- malformed CLI syntax or host parameter encoding that cannot be represented by the neutral toolset,
- skipped adapter-required discovery steps,
- adapter-specific unknown action names when the action protocol is not shared,
- activity/progress/debug copy,
- transport, persistence, or cancellation messages.

When an adapter wraps errors into its own output shape, include an origin marker or equivalent distinction, for example:

```ts
type AdapterError = {
  readonly origin: "adapter" | "source";
  readonly code: string;
  readonly message: string;
  readonly recoverable?: boolean;
  readonly retryable?: boolean;
  readonly recoveryAction?: ValidationRecoveryAction;
  readonly repair?: unknown;
  readonly details?: Record<string, unknown>;
};
```

For `origin: "source"`, prefer passing through source messages and structured recovery details. Do not add generic wrapper warnings unless the source did not provide actionable guidance.

## Optional host adapter guidance

Host apps may wrap the neutral toolset differently.

Examples:

- A strict OpenAI/TanStack host may pass arbitrary operation input as a JSON string because arbitrary object properties are difficult in strict schemas.
- A workflow app may keep a catalog of available tools but activate only selected tool ids for a given node.
- A chat app may require `getCommandHelp()` before `execute()` to reduce invalid tool calls and schema flooding.

Required host behavior:

- Preserve source-owned validation and execution error metadata, including recovery actions and parameter-level validation details.
- Distinguish host/protocol errors from source-owned errors in the host output shape.
- Use machine-readable fields such as `recoverable`, `retryable`, `recoveryAction`, `operationName`, and `parameter` for recovery decisions instead of parsing localized prose, CLI help text, `message`, or `recoveryHint`.
- Avoid duplicate host-authored warnings around source-owned failures.
- Forward `AbortSignal` when the host supports cancellation.
- Keep host UI activity separate from canonical operation results.
- Avoid copying operation schemas into host-specific code unless generated or tested against the neutral source.

## Conformance checks

Automated checks should verify shape, not product quality.

Good automated checks:

- `package.json` has a CLI `bin`.
- `package.json` exports `./toolset`.
- Referenced CLI and `./toolset` files exist after build.
- The neutral toolset factory imports and returns the required functions.
- `help()`, `listOperations()`, and `getCommandHelp()` are network-free.
- Operation specs include schemas, examples, limitations, and result summaries.
- Unknown operations produce structured validation failures with machine-readable recovery metadata.
- Known validation failures, including non-object input, missing required parameters, invalid identifiers, and unknown parameters, return structured recovery metadata from `validateInput()`.
- Example inputs pass `validateInput()`.
- `serializeError()` returns a structured error.
- `--help` exits 0 and prints help text.
- Invalid CLI usage exits non-zero and prints exactly one JSON failure object to stdout.
- A known safe success command, when supplied to the checker, exits 0 and prints exactly one JSON success object to stdout.
- JSON failure objects preserve structured error metadata, including recoverability, recovery actions, operation names, parameter names, expected/actual details when safe, examples, and recovery hints.
- Command examples in help are covered by project-specific tests when practical.

Human review is still required for:

- operation boundaries,
- field naming,
- result usefulness,
- reference quality,
- warning quality,
- English control-plane clarity for labels, descriptions, help, prompt guidance, validation copy, warnings, summaries, and errors, including correct preservation of official Korean source terms,
- prompt guidance and whether reusable prompt/action copy is neutral-owned,
- source drift and safety claims,
- whether an optional adapter should exist at all for an internal product need.

## Acceptance checklist

A package follows this spec when:

- the required CLI surface exists,
- the required `./toolset` export exists,
- the neutral toolset owns operation discovery, validation, execution, reusable English agent guidance, source-owned messages, result summaries, recovery hints, and errors,
- the CLI is a thin adapter over the neutral toolset,
- help is the source of truth for current CLI commands and options,
- every operation has stable schemas and examples,
- successful command output is one structured JSON object on stdout,
- failed command output is one structured JSON failure object on stdout plus a non-zero exit,
- stderr cannot corrupt stdout parsing,
- invalid input produces useful structured recovery metadata without requiring hosts to parse prose,
- execution supports cancellation,
- results preserve references/warnings/metadata where relevant,
- automated CLI and toolset conformance checks pass,
- human review confirms the operations are agent-usable.
