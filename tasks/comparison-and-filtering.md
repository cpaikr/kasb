# Improve comparison and framework filtering

## Outcome

Users can distinguish and compare relevant K-IFRS and general-GAAP material
without manually reconstructing framework identity from noisy search results.

## Current state

Tryouts for `충당부채` required manual discovery of K-IFRS `1037` and general
GAAP `14`. Adding framework terms often degraded search, and no operation
retrieves comparable sections across standards. This work is not part of the
Rust/Node rewrite.

## Next action

After the rewrite, specify a primitive framework or standard-kind filter for
`search-standards` before considering a comparison-oriented operation.
