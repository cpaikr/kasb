# Specs

This directory is for stable, evidence-backed capability specs.

A document belongs here when it defines an implementation target, such as:

- operation names
- public request and success-result schemas
- stable identifiers and citation rules
- typed failures, warnings, and constraints
- source evidence promoted from `docs/research/`

Do not put product vision, stack discussion, or open-ended source investigation here. Keep those in the repo root or `docs/research/`.

## Current Specs

- [kasb-standards-v1.md](kasb-standards-v1.md)
  v1 KASB capabilities: `search-standards`, `get-standard-structure`, `get-section`, `get-paragraph`, `search-qna`, and `get-qna`.

## Conventions

- Public JSON fields use camelCase.
- CLI commands and flags use kebab-case.
- Success result schemas include `result`, `metadata`, `references`, and `warnings`.
- Typed failures are separate from success result schemas.
- CLI operation success and failure outputs are JSON on `stdout`; failures exit
  nonzero, while help output may remain human-readable.
- Raw source fields stay internal unless the spec explicitly promotes them.
