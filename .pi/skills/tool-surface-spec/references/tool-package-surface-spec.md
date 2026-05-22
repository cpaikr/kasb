# Reusable Tool Package Surface Spec

## Purpose

This spec defines a project-neutral shape for packages that expose deterministic agent-usable capabilities through:

1. a CLI,
2. a runtime-neutral TypeScript toolset SDK,
3. a Pi tool adapter/extension.

The package should feel usable by humans, scripts, Pi agents, web-agent hosts, and future adapters without copying capability logic. Compatibility is defined at the package surface and outer output-envelope level; each package still defines its own domain operations and `result` payload schemas.

## Non-goals

- This is not an MCP spec. Add MCP only when a target runtime needs it.
- This is not a marketplace/plugin system.
- This does not prescribe one domain `result` payload for every tool family.
- This does not require every host adapter to expose the exact same parameter encoding.

## Required package surfaces

`package.json` should expose the public surfaces explicitly:

```jsonc
{
  "bin": {
    "example-tool": "dist/cli.js",
  },
  "exports": {
    "./toolset": {
      "types": "./dist/toolset.d.ts",
      "import": "./dist/toolset.js",
    },
    "./pi": {
      "types": "./dist/pi.d.ts",
      "import": "./dist/pi.js",
    },
  },
  "pi": {
    "extensions": ["./dist/pi-extension.js"],
  },
}
```

Naming guidance:

- Use a short stable package/tool id, usually the CLI binary name.
- Use kebab-case canonical operation names: `search-company`, `view-report`, `list-items`.
- Prefix host-specific function names only when the host requires it. Keep canonical operation names host-neutral.

## Layering model

```text
source/domain adapters -> capability contracts -> neutral toolset -> host adapters
                                                        |-> CLI
                                                        |-> Pi
                                                        |-> web/OpenAI/TanStack wrappers
                                                        |-> future MCP/HTTP/etc.
```

The neutral toolset is the public contract. Adapters parse, render, and translate, but should not own domain behavior, domain validation copy, reusable agent guidance, or source-specific recovery guidance.

## Compatibility boundary

The compatibility contract is the shared shell that hosts and agents can rely on across unrelated packages:

- `package.json` public surfaces,
- toolset identity, help, operation discovery, operation specs, validation, execution, and error serialization methods,
- validation result and serialized error shapes,
- operation spec fields, including each operation's own input and result schemas,
- single-tool action input shape for Pi and similar hosts,
- host-facing action output shape: model-readable `content` plus structured `details`.

The domain contract is intentionally project-specific:

- the specific set of canonical operation names,
- operation input fields,
- operation result payloads under `result`,
- references, metadata, warnings, and source-specific fields inside those operation results.

A greenfield project is compatible when it implements the shared shell and documents its own payloads through operation schemas. It does not need to copy another package's operations or payload fields.

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

- `help()` is network-free and lists what the toolset can do.
- `listOperations()` is network-free and returns canonical operation summaries.
- `getCommandHelp(name)` is network-free and returns the operation contract.
- `validateInput(name, input)` is network-free and normalizes valid input when possible.
- `execute(name, input, context)` runs one operation, respects `context.signal`, and returns the operation's domain payload as described by that operation's `resultJsonSchema`.
- `serializeError(error)` preserves structured error fields across package/host boundaries.

`execute()` intentionally returns `unknown` at the common interface because operation payloads differ by project and command. Cross-project compatibility comes from operation discovery, schemas, validation, serialized errors, and host action envelopes, not from forcing one global domain payload.

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
- Examples should be valid inputs that can be used by docs, tests, and agent prompts.
- Limitations should state source drift, auth gaps, partial coverage, and known unsupported cases.
- Result schemas should preserve enough structure for downstream automation.

## Validation and error contract

Validation failures should be structured and recoverable:

```ts
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
  readonly recoveryHint?: string;
  readonly exampleInput?: Record<string, unknown>;
  readonly retryable: boolean;
  readonly recoveryAction?:
    | { readonly kind: "inspect_tool_help" }
    | { readonly kind: "inspect_command_help"; readonly operationName: string };
};

export type ValidationResult =
  | { readonly ok: true; readonly input: Record<string, unknown> }
  | { readonly ok: false; readonly error: ValidationFailure };
```

Execution errors should be serializable:

```ts
export type SerializedError = {
  readonly name: string;
  readonly message: string;
  readonly code?: string;
  readonly retryable?: boolean;
  readonly parameter?: string;
  readonly sourceUrl?: string;
  readonly recoveryHint?: string;
  readonly operationName?: string;
};
```

Hosts should preserve these fields instead of rephrasing them into unstructured prose.

## Host-facing action output contract

Pi and similar single-tool host adapters should expose a stable outer result shape even though the domain payload varies by operation:

```ts
type TextContent = {
  readonly type: "text";
  readonly text: string;
};

type HostToolResult = {
  readonly content: readonly TextContent[];
  readonly details: SingleToolActionResult;
};

type SingleToolActionResult =
  | {
      readonly ok: true;
      readonly action: "help";
      readonly help: ToolsetHelp;
    }
  | {
      readonly ok: true;
      readonly action: "command_help";
      readonly command: string;
      readonly commandHelp: OperationSpec;
    }
  | {
      readonly ok: true;
      readonly action: "validate";
      readonly command: string;
      readonly validation: Extract<ValidationResult, { ok: true }>;
    }
  | {
      readonly ok: true;
      readonly action: "run";
      readonly command: string;
      readonly normalizedInput: Record<string, unknown>;
      readonly result: unknown;
    }
  | {
      readonly ok: false;
      readonly action: "help" | "command_help" | "validate" | "run" | "adapter_validation";
      readonly command?: string;
      readonly error: ValidationFailure | SerializedError;
    };
```

Rules:

- `content` is the model-readable presentation for the host.
- `details` is the machine-readable compatibility envelope.
- `details.ok`, `details.action`, `details.command`, and `details.error` have stable meaning across packages.
- `details.result` is the only operation-specific field in the shared `run` success envelope; its schema is the selected operation's `resultJsonSchema`.
- `details.normalizedInput` should contain the validated/normalized input actually sent to `execute()`.
- Adapter or protocol failures that happen before the neutral toolset can validate input should use `action: "adapter_validation"` and a `ValidationFailure`-compatible error.

This contract is what lets greenfield packages expose compatible outputs without sharing another package's domain model.

## Message ownership

Source packages should own domain and reusable agent messages:

- operation descriptions and result summaries,
- limitations and citation guidance,
- validation failure messages,
- retryability and recovery hints,
- source warnings and execution error messages,
- shared single-tool action descriptions, prompt snippets, and model-facing formatters when more than one host can reuse them.

Host adapters should own only host/protocol messages:

- malformed host parameter encoding that cannot be represented by the neutral toolset,
- skipped host-required discovery steps,
- host-specific unknown action names when the action protocol is not shared,
- activity/progress copy,
- transport, persistence, or cancellation messages.

When a host wraps errors into its own output shape, include an origin marker or equivalent distinction, for example:

```ts
type HostToolError = {
  readonly origin: "host" | "source";
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly repair?: unknown;
  readonly details?: Record<string, unknown>;
};
```

For `origin: "source"`, prefer passing through source messages and structured recovery details. Do not add generic wrapper warnings unless the source did not provide actionable guidance.

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

The CLI should be a thin adapter over the same operations.

Required behavior:

- `--help` and command help are human-readable text.
- Successful command execution prints exactly one JSON response object to stdout.
- Command failure prints exactly one JSON failure object to stdout and exits non-zero.
- The CLI should not hide structured errors that the neutral toolset exposes.
- CLI examples should match operation examples where practical.

Recommended behavior:

- Provide a `--pretty` flag for manual debugging.
- Keep CLI flags semantic and stable.
- Do not make terminal prose the only machine-readable output.

## Pi adapter contract

The `./pi` export should provide a factory, normally named `create<Name>PiTool()`, and registration helper if useful.

Recommended public shape:

```ts
export type PiToolInput = {
  action: "help" | "command_help" | "validate" | "run";
  command?: string;
  inputJson?: Record<string, unknown>;
};
```

The Pi adapter should expose one package-level tool for the toolset unless there is a strong reason to expose many separate tools.

Required behavior:

- `help` returns toolset-level guidance and operation summaries in the standard action output envelope.
- `command_help` returns one operation spec in the standard action output envelope.
- `validate` runs neutral validation without executing the operation and returns the standard action output envelope.
- `run` validates, executes, and returns the standard action output envelope with the operation payload under `details.result`.
- Result content should be model-readable text, preferably formatted by reusable neutral helpers when another host can share it.
- Full structured details must be preserved in `details` or an equivalent host-specific structured channel that keeps the same action-result fields.
- Parameters should include an action enum, a command enum using canonical operation names, and an `inputJson` object.

Package-level Pi extension metadata should point to a built extension file that registers the Pi tool.

## Host adapter guidance

Host apps may wrap the neutral toolset differently.

Examples:

- A Pi host can pass `inputJson` as an object.
- A strict OpenAI/TanStack host may pass `inputJson` as a JSON string because arbitrary object properties are difficult in strict schemas.
- A workflow app may keep a catalog of available tools but activate only selected tool ids for a given node.
- A chat app may require `command_help` before `run` to reduce invalid tool calls and schema flooding.

Required host behavior:

- Preserve source-owned validation and execution error metadata.
- Distinguish host/protocol errors from source-owned errors in the host output shape.
- Avoid duplicate host-authored warnings around source-owned failures.
- Forward `AbortSignal` when the host supports cancellation.
- Keep host UI activity separate from canonical operation results.
- Avoid copying operation schemas into host-specific code unless generated or tested against the neutral source.

## Conformance checks

Automated checks should verify shape, not product quality.

Good automated checks:

- `package.json` has a CLI `bin`.
- `package.json` exports `./toolset` and `./pi`.
- `package.json` has `pi.extensions` entries.
- Export files exist after build.
- The neutral toolset factory imports and returns the required functions.
- `help()`, `listOperations()`, and `getCommandHelp()` are network-free.
- Operation specs include schemas, examples, limitations, and result summaries.
- Unknown operations produce structured validation failures.
- Example inputs pass `validateInput()`.
- The Pi factory imports and returns one valid tool definition.
- Pi parameters expose `help`, `command_help`, `validate`, and `run` actions.
- Pi `help`, `command_help`, and `validate` calls return text content plus structured action details.
- Pi action details use stable `ok`, `action`, `command`, `error`, `validation`, and `result` fields as applicable.
- CLI help runs, and invalid CLI usage returns a JSON failure envelope.

Human review is still required for:

- operation boundaries,
- field naming,
- result usefulness,
- reference quality,
- warning quality,
- prompt guidance and whether reusable prompt/action copy is neutral-owned,
- source drift and safety claims,
- whether an adapter should exist at all.

## Acceptance checklist

A package follows this spec when:

- all three required surfaces exist,
- the neutral toolset owns operation discovery, validation, execution, reusable agent guidance, source-owned messages, result summaries, recovery hints, and errors,
- CLI and Pi are thin adapters over the neutral toolset,
- every operation has stable schemas and examples,
- invalid input produces useful recovery metadata,
- execution supports cancellation,
- results preserve references/warnings/metadata where relevant,
- automated conformance checks pass,
- human review confirms the operations are agent-usable.
