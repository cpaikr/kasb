---
name: tool-surface-spec
description: Design, review, scaffold, or validate reusable agent-tool packages that expose a CLI, runtime-neutral TypeScript toolset SDK, and Pi adapter over one deterministic capability core. Use when a user wants Darty-like package surfaces, project-neutral tool contracts, package conformance checks, or a skill for creating similar tools across projects.
---

# Tool Surface Spec

Help projects expose deterministic capabilities through three thin public surfaces:

1. a human/debuggable CLI,
2. a runtime-neutral TypeScript toolset SDK,
3. a Pi adapter/extension wrapping the neutral toolset.

The core idea is **one capability contract, many adapters**. Compatibility means the package surfaces, action envelopes, validation results, error objects, help shapes, and operation metadata are stable across projects; each project still owns its domain-specific operations and `result` payloads. Do not let CLI, Pi, MCP, OpenAI, or web-chat glue own domain behavior.

## Workflow

1. Clarify target scope.
   - Confirm whether the user wants a design review, a spec, a scaffold, implementation, or conformance checks.
   - Confirm the required public surfaces. Default to CLI + `./toolset` + `./pi`; do not add MCP unless explicitly requested.
   - Confirm whether scripts may import and execute the local package.

2. Inspect the project.
   - Read `package.json`, README/docs, existing CLI entrypoints, SDK exports, Pi extension files, tests, and build scripts.
   - Identify the deterministic core and current transport adapters.
   - Look for existing schema systems: JSON Schema, Effect Schema, Zod, TypeBox, or hand-written validators.

3. Apply the surface spec.
   - Read `references/tool-package-surface-spec.md`.
   - Keep the neutral toolset as the canonical contract: operation discovery, help, JSON Schemas, validation, execution, reusable agent guidance, source-owned result summaries, recovery guidance, and error serialization.
   - Keep host-facing compatibility in the outer shells: single-tool action input, `content` text blocks, `details.ok/action/command/error`, validation results, serialized errors, and operation specs.
   - Keep domain variance inside operation definitions and the `result` payload. Do not require greenfield projects to mimic another package's domain fields.
   - Keep CLI and Pi adapters thin. They may own final protocol rendering, argument parsing, transport envelopes, and host-specific parameter shapes, but not domain logic or duplicate domain messages.

4. Decide what can be automated.
   - Use automated checks for package shape, imports, function presence, operation metadata, validation error shape, Pi tool shape, and CLI smoke behavior.
   - Use human review for operation boundaries, result usefulness, references, warning quality, examples, and model ergonomics.
   - If adding checks, prefer a dependency-light script similar to `scripts/validate-tool-surface.mjs`.

5. Produce a compact result.
   - For a review: report pass/fail by surface, concrete gaps, and smallest fixes.
   - For implementation: edit only the required package files and tests.
   - For a new package: propose the core/toolset/adapter file layout before writing code.

## Guardrails

- Do not duplicate domain logic, operation descriptions, validation copy, recovery hints, result summaries, or reusable single-tool prompt/action copy across adapters.
- If Pi, web, or another host share the same single-tool action protocol, keep that shared copy and formatting in the neutral toolset and let adapters only wrap it in their host result shape.
- Do not require agents to infer retry policy from JSON Schema alone; preserve validation/error recovery metadata.
- Do not force one domain payload shape across all tools. Require compatible outer envelopes and typed errors; put project-specific data under the operation `result` payload and describe it with that operation's result schema.
- Forward `AbortSignal` through adapters into neutral execution.
- Treat host parameter quirks as adapter details. For example, Pi can pass `inputJson` as an object, while strict OpenAI tool schemas may need a JSON string.
- Separate tool availability from activation in host apps.
- In host outputs, distinguish host/protocol failures from source-owned failures; do not add duplicate host warnings around source-owned messages.

## References

- `references/tool-package-surface-spec.md` — normative package surface spec.
- `references/review-checklist.md` — human review checklist.
- `scripts/validate-tool-surface.mjs` — optional conformance smoke checker.
