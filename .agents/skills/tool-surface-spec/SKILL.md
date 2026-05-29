---
name: tool-surface-spec
description: Design, review, scaffold, or validate reusable agent-tool packages with a CLI plus runtime-neutral toolset SDK. Use when a user wants command-line tool contracts, TypeScript toolset exports, JSON stdout/stderr behavior, package conformance checks, or guidance for deterministic tools agents can discover and run.
---

# Tool Surface Spec

Help projects expose deterministic capabilities through **two required public surfaces**: a CLI for subprocess use and a runtime-neutral `./toolset` SDK for in-process adapters.

The core idea is **one capability contract with thin adapters**. Compatibility means agents can discover current behavior from the CLI, run commands as subprocesses, import the neutral toolset when an in-process integration needs it, and receive predictable structured outputs without needing Pi-specific extensions or host-specific wrappers.

## Workflow

1. Clarify target scope.
   - Confirm whether the user wants a design review, a spec, a scaffold, implementation, or conformance checks.
   - Require both public surfaces by default: CLI plus runtime-neutral TypeScript toolset SDK.
   - Do not require Pi extensions, MCP servers, or host adapters unless the user explicitly requests that host integration.
   - Confirm how the CLI should be invoked: installed command, explicit executable path, or package-runner command such as `npx`, `bunx`, or `pnpm dlx`.

2. Inspect the project.
   - Read `package.json`, README/docs, existing CLI entrypoints, `./toolset` exports, tests, and build scripts.
   - Identify the deterministic capability core behind the CLI and toolset.
   - Inspect the CLI's own `--help` and relevant command help. Treat that help as the source of truth for current CLI commands, options, inputs, and output shape.
   - Inspect the toolset's operation discovery, command help, validation, execution, and error serialization shape.
   - Check that `validateInput()` returns structured recovery metadata for known validation failures, including unknown operation, non-object input, missing required parameter, invalid identifier, and unknown parameter cases.

3. Apply the surface spec.
   - Read `references/tool-package-surface-spec.md`.
   - Keep behavior discoverable through `--help`, command-level help, `toolset.help()`, `listOperations()`, and `getCommandHelp()`.
   - Keep CLI commands thin over the neutral toolset. Argument parsing and final process rendering belong in the CLI; domain logic, source messages, validation rules, recovery hints, warnings, references, and result metadata should be produced by reusable capability/toolset code.
   - Keep successful stdout machine-readable: preferably exactly one structured JSON object.
   - Keep failure stdout machine-readable: preferably exactly one structured JSON failure object plus a non-zero exit.
   - Preserve validation recovery metadata such as `recoverable`, `recoveryAction`, `operationName`, `parameter`, `reason`, `expected`, safe `actual`, `exampleInput`, and `recoveryHint` in toolset validation results and CLI JSON failures.
   - Keep stderr reserved for diagnostics/progress that should not corrupt stdout JSON.
   - Keep reusable tool packages English-native for the agent/control plane: toolset labels, operation descriptions, command help, option descriptions, validation/errors, recovery hints, warnings, result summaries, and prompt guidance should be English. Preserve official Korean domain terms when they are source-native identifiers users and filings actually use, such as `사업보고서`, `감사보고서`, `반기보고서`, `분기보고서`, `표준지 공시지가`, and `개별공시지가`.

4. Decide what can be automated.
   - Use automated checks for package `bin` shape, `./toolset` export shape, built artifact presence, toolset methods, operation specs, validation failures, help behavior, invalid-command JSON failures, and known success-command JSON output when a safe command is available.
   - Use human review for operation boundaries, result usefulness, source references, warning quality, examples, and model ergonomics.
   - If adding checks, prefer a dependency-light script similar to `scripts/validate-tool-surface.mjs`.

5. Produce a compact result.
   - For a review: report pass/fail by CLI and toolset contract area, concrete gaps, and smallest fixes.
   - For implementation: edit only the required package files and tests.
   - For a new package: propose the toolset operation layout, CLI command layout, and JSON output contract before writing code.

## Guardrails

- Do not require external users or agents to install Pi extensions or use host action envelopes.
- Do not make the CLI the only reusable boundary when in-process host adapters need the same deterministic capability contract; expose `./toolset` instead of duplicating logic.
- Do not duplicate domain logic, validation copy, recovery hints, result summaries, or source warnings in argument-parsing code.
- Do not make terminal prose the only machine-readable output for normal command results.
- Do not hide structured errors behind generic exit messages.
- Keep package/tool-level labels and descriptions English-native for reusable agent packages. Command help, JSON Schema descriptions, parameter descriptions, examples, result-field descriptions, recovery hints, and prompt snippets should preserve concrete usage constraints, source provenance, mutually exclusive fields, accepted/rejected identifiers, and cross-command references needed to use the command correctly.
- Do not maintain separate Korean, English, and agent-facing variants for reusable tool definitions. The package-owned agent contract is English; host apps own localized UI display copy in their presentation catalogs when they need localized labels or descriptions.
- Preserve source-native Korean terms when translating them would make the tool less accurate or harder to use with the source system. Prefer `사업보고서`, `감사보고서`, `반기보고서`, `분기보고서`, `표준지 공시지가`, `개별공시지가`, `법정동`, and similar official terms as-is, optionally with a short English gloss on first mention when it helps model understanding.
- Do not require agents to infer retry policy from option names alone; preserve validation/error recovery metadata in toolset validation results and CLI JSON failures.
- Do not require hosts or agents to parse localized prose, CLI help text, freeform `message`, or `recoveryHint` to choose a recovery path; expose machine-readable recovery actions and parameter metadata.
- Do not force one domain payload shape across all tools. Require compatible toolset/CLI behavior and typed errors; put project-specific data under the operation or command's result payload and document it in operation specs and command help.
- Forward cancellation/timeouts through `ToolRunContext.signal` and subprocess-safe mechanisms when the runtime supports them.
- Separate package availability from task activation in host apps.

## References

- `references/tool-package-surface-spec.md` — normative CLI + neutral toolset package surface spec.
- `references/review-checklist.md` — human review checklist.
- `scripts/validate-tool-surface.mjs` — optional CLI/toolset conformance smoke checker.
