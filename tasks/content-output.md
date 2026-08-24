# Refine structured and human-facing content output

## Outcome

CLI consumers can choose concise normalized content or preserved source detail
without losing provenance or receiving inconsistent HTML warnings.

## Current state

Tryouts found `contentHtml` and `relStds` noisy in human-facing output, while
structure titles can preserve HTML such as `<sup>` without a consistent
warning. Raw source detail remains useful for verification. This work is not
part of the Rust/Node rewrite unless required to preserve the current contract.

## Next action

After the rewrite, review `summary`, `structured`, and `raw` behavior against
real consumers and specify one consistent HTML preservation/normalization rule.
