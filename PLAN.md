# Plan

Current job: derive the KASB identifier and reference model from the captured source evidence.

## Goal

Turn the findings in `docs/research/kasb-standard-source-map.md` into a clear public reference model for the next spec step.

## In Scope

- separate stable public identifiers from route-only or UI-only ids
- compare `stdNum`, `paraNum`, `uniqueKey`, `titleDocumentId`, and `indexDocumentId`
- decide which ids the future read-only tool should accept and return
- record any unresolved mappings that still block the spec

## Out Of Scope

- full capability schema drafting
- transport or adapter decisions
- write or auth flows

## Work Plan

1. Restate the two document-id spaces and the evidence that they differ.
2. Define the canonical reference tuple for standard, section, and paragraph retrieval.
3. Mark which upstream fields are safe to expose, derive, or hide.
4. Record the remaining mapping gaps that the v1 spec must acknowledge explicitly.

## Open Questions

- Should the public contract expose `indexDocumentId`, or should section retrieval be defined through a higher-level path model?
- Is there a deterministic mapping from `titleDocumentId` to `indexDocumentId`, or should route ids stay internal?
- When a caller wants one exact paragraph, is `paraNum` alone sufficient, or do some ambiguous cases require an accompanying section key?

## Exit Criteria

- the public identifier model is clear enough to draft the v1 read-only operations
- the doc-id mismatch is explicitly accounted for in the spec inputs and outputs
- any unresolved identifier gaps are listed as conscious constraints, not hidden assumptions
