# Standardize KASB toolset validation recovery metadata

## Background

`@sjunepark/kasb/toolset` already exposes structured validation failures with `recoveryHint`, `retryable`, and `recoveryAction`. This ticket is to audit and standardize that behavior against the installed Open Creo `tool-surface-spec` skill so host apps can rely on it consistently, especially the distinction between input-repair recoverability and same-input retryability.

Use the local Open Creo toolset skill before implementation. Apply its neutral toolset guidance; do not make this a Pi-specific contract.

## Scope

- Review `packages/kasb-ts/src/toolset.ts` validation failure types and constructors against `tool-surface-spec` guidance.
- Confirm every caller-repairable validation failure carries:
  - `recoverable: true`;
  - human-readable `recoveryHint`;
  - machine-readable `recoveryAction`.
- Reserve `retryable` for cases where the same input might succeed later. If existing KASB callers already interpret `retryable` as input-repairable, document it as a compatibility alias while making `recoverable` the preferred validation recovery field.
- Ensure operation-scoped input failures point to `inspect_command_help` for the relevant operation.
- Ensure unknown operation / unknown command failures point to `inspect_tool_help`.
- Ensure serialized errors and CLI JSON failures preserve recovery fields where they are part of the public contract.
- Keep the neutral `@sjunepark/kasb/toolset` contract independent of Pi runtime types.

## Cases to cover

At minimum, cover these validation paths in tests or existing test assertions:

- unknown operation name;
- non-object operation input;
- missing required parameter;
- invalid identifier or enum value;
- unknown parameter;
- single-tool action protocol failures, if that action envelope remains public.

## Acceptance criteria

- Toolset tests assert the recovery action kind, relevant operation name, and `recoverable` value for representative validation failures.
- Human `recoveryHint` remains present and useful, but no host needs to parse it to know the next tool action.
- Public validation failures distinguish input-repair `recoverable` cases from same-input-later `retryable` cases.
- The public type declarations expose the chosen recovery fields.
- `serializeError()` preserves public recovery fields from validation/toolset errors where applicable.
- README or architecture docs briefly mention that toolset validation failures include structured recovery metadata for host adapters.
- `bun run typecheck` and `bun test` pass.
