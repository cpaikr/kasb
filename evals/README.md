# Evals

This directory holds internal evaluation artifacts for KASB capability ergonomics. It is not a public transport surface.

## Typed tool eval track

`typed-tools.ts` exposes internal tool-like definitions backed directly by `src/app/*` operations:

- inputs use capability JSON field names such as `stdNum`, `indexDocumentId`, `paraNum`, and `docNumber`
- schemas are the same JSON Schema exports used by the app layer
- execution calls the same shared capability envelopes returned by app operations
- CLI flag syntax, stream behavior, and exit-code behavior remain covered by CLI tests instead

Use these definitions for capability-level evals where subprocess and argv parsing would hide schema or result-shape problems.
