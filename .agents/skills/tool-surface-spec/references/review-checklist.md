# Reusable Tool Package Review Checklist

Use this checklist after reading the target package and the surface spec.

## Package surfaces

- [ ] `package.json` defines at least one CLI `bin`.
- [ ] `package.json` exports `./toolset`.
- [ ] `package.json` exports `./pi`.
- [ ] `package.json` declares Pi extension metadata.
- [ ] Build output files referenced by public exports exist.

## Compatibility boundary

- [ ] The package keeps cross-project compatibility in shared shells: toolset methods, operation specs, validation results, serialized errors, and host action envelopes.
- [ ] The package keeps project-specific domain data inside operation inputs and `details.result` / operation result payloads.
- [ ] The package does not require greenfield projects or hosts to know another package's domain-specific result fields.

## Neutral toolset

- [ ] The toolset factory can be imported without starting network work.
- [ ] The toolset exposes `id`, `label`, `description`.
- [ ] Toolset, operation, host-tool, and internal agent-native function tool labels/descriptions are English-native model-facing copy, with source-native Korean terms, proper nouns, and stable machine ids preserved when appropriate.
- [ ] The package does not maintain separate Korean, English, and agent-facing variants for reusable tool definitions; Korean UI copy, if needed, belongs to the host application's presentation layer.
- [ ] Only top-level package/toolset descriptions and top-level host-tool descriptions, especially the single Pi extension tool description, are purpose-only and free of call sequences, action names, parameter hints, or other how-to-use instructions.
- [ ] Operation specs, command help, JSON Schema property descriptions, parameter descriptions, `oneOf` branch descriptions, result-field descriptions, recovery hints, prompt snippets, and internal agent-native function tool descriptions still preserve concrete usage constraints, source provenance, mutually exclusive-field rules, accepted/rejected identifier types, and cross-operation references.
- [ ] `help()` gives toolset-level guidance and limitations.
- [ ] `listOperations()` returns stable canonical operation names.
- [ ] `getCommandHelp(name)` returns one operation contract.
- [ ] `validateInput(name, input)` is network-free and normalizes input.
- [ ] `execute(name, input, { signal })` runs one operation, respects cancellation, and returns a payload described by that operation's `resultJsonSchema`.
- [ ] `serializeError(error)` preserves structured error fields.
- [ ] Domain messages, result summaries, validation copy, recovery hints, and reusable single-tool agent guidance live in the neutral toolset/capability layer rather than host adapters.
- [ ] Help, operation descriptions, validation/error messages, recovery hints, warnings, summaries, limitations, citation guidance, and prompt guidance are written in English for agent reliability, while preserving official Korean source terms such as `사업보고서`, `감사보고서`, `표준지 공시지가`, and `개별공시지가`.

## Operation contracts

- [ ] Operation names are host-neutral and kebab-case.
- [ ] Inputs use semantic fields instead of raw transport flags.
- [ ] Input schemas reject unknown or unsafe shapes where appropriate.
- [ ] Result schemas describe the structured payload.
- [ ] Examples are valid and realistic.
- [ ] Limitations are concrete, not boilerplate.
- [ ] Results preserve references, metadata, warnings, and source context when relevant.
- [ ] Source-owned presentation fields such as summaries, findings, normalized sources, or warnings are produced by the neutral layer when the package needs host-ready presentation.

## CLI adapter

- [ ] CLI flags map to operation inputs without changing semantics.
- [ ] Help is human-readable English text for agents and developers, with official Korean domain terms preserved where source accuracy requires them.
- [ ] Successful command execution emits one JSON object to stdout.
- [ ] Command failure emits one JSON object to stdout and exits non-zero.
- [ ] CLI errors preserve neutral error metadata.

## Pi adapter

- [ ] The Pi factory returns one package-level tool unless many tools are clearly justified.
- [ ] Actions include `help`, `command_help`, `validate`, and `run`.
- [ ] `command` uses canonical operation names.
- [ ] `inputJson` carries operation input.
- [ ] English model-readable text and structured details are both returned, while official Korean document names, report types, addresses, section titles, and identifiers remain source-native.
- [ ] Every action returns the standard outer shape: `content[]` plus `details`.
- [ ] Successful `details` include stable `ok: true`, `action`, and action-specific fields (`help`, `commandHelp`, `validation`, or `result`).
- [ ] `run` success puts operation-specific data under `details.result` and includes `details.normalizedInput`.
- [ ] Failures include stable `ok: false`, `action`, optional `command`, and structured `error`.
- [ ] Prompt snippet/guidelines explain in English when and how to use the tool.
- [ ] When internal function tools are derived from operations, such as `darty_search_body` or `kasb_get_section`, their English descriptions preserve practical guidance about required identifiers, mutually exclusive fields, accepted/rejected identifier types, source provenance, and cross-command lookup paths; official Korean source terms remain untranslated.
- [ ] Adapter validation failures point the model toward help or command help.
- [ ] Pi presentation text wraps neutral details and reuses neutral formatters/copy when another host can share the same text.

## Host integration

- [ ] Host-specific parameter quirks stay in the host adapter.
- [ ] The host preserves source-owned validation and error metadata.
- [ ] Host/protocol errors are distinguishable from source-owned errors.
- [ ] Host-authored warnings do not duplicate source-owned validation or execution messages.
- [ ] The host forwards `AbortSignal` when available.
- [ ] Tool availability and activation are separate when the host supports selected tools.
- [ ] UI activity summaries do not replace canonical operation results.

## Human judgment

- [ ] Each operation is one meaningful action, not a vague prompt wrapper.
- [ ] The result is useful for the next agent step without extra browsing.
- [ ] Important claims can be cited or revisited through references.
- [ ] The schemas are small enough for model use but complete enough for validation.
- [ ] The package does not add future adapters, compatibility layers, or broad abstractions before a real host needs them.
