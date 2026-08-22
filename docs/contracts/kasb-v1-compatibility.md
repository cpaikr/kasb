# KASB v1 compatibility baseline

Status: frozen replacement inventory

This inventory records the executable compatibility surface that the Rust/Node
replacement must preserve, intentionally extend, or intentionally retire. The
[v1 semantic specification](../specs/kasb-standards-v1.md) remains normative;
this document prevents accidental cutover regressions in packaging and
transport behavior.

## Package surface

- Preserve npm identity `@sjunepark/kasb`, executable `kasb`, Node floor
  `>=20.18.1`, and the `./toolset` export.
- The current package has no `.` export. The replacement adds a root Node SDK
  export because a Rust-backed Node SDK is an included product result; this is
  additive and does not move toolset discovery or validation onto the network.
- Preserve the documented toolset operation names, help/discovery, closed JSON
  input validation, execution context with `AbortSignal`, stable validation
  failures, execution error serialization, helper formatters, and the custom
  operation-table option. Default built-in operations must delegate to Rust;
  a caller-supplied operation table is caller code, not a project conformer.
- Preserve the current `./toolset` runtime exports:
  `kasbOperationNames`, `kasbSingleToolActions`, `KasbToolsetError`,
  `createKasbUnknownOperationError`, `kasbSingleToolCopy`,
  `formatKasbToolsetHelp`, `formatKasbCommandHelp`,
  `formatKasbValidationSuccess`, `formatKasbValidationFailure`,
  `formatKasbRunSuccess`, `formatKasbRunFailure`,
  `formatKasbInvalidToolInput`, `formatKasbUnknownCommand`,
  `createKasbSingleToolActionFailure`, `createKasbSingleToolCommandFailure`,
  `createKasbSingleToolInputJsonFailure`, `serializeKasbError`, and
  `createKasbToolset`. Preserve their emitted public declaration types.
- `contracts/node/toolset-v1.d.ts` freezes the exact emitted `./toolset`
  declaration surface; `bun run contracts:check` regenerates declarations in
  a temporary directory and rejects unreviewed drift.
- `createKasbToolset()` continues to expose `help`, `listOperations`,
  `getOperation`, `getCommandHelp`, side-effect-free `validateInput`, async
  `execute`, and `serializeError`. Toolset validation codes remain
  `missing_parameter`, `invalid_parameter`, `unknown_parameter`, and
  `invalid_request`, separate from capability failure codes.
- Retire `./pi`, `pi.extensions`, the Pi extension entrypoint, and Pi-specific
  runtime types only at final cutover. This is the approved breaking package
  change.
- Generated declarations, built facade files, target resolution, and packed
  file lists must have named canonical inputs and freshness checks.

## Capability surface

The six operation ids and camelCase request fields are frozen by the v1 spec.
Each success is a closed `{result, metadata, references, warnings}` envelope.
Failures preserve `code`, `message`, `retryable`, optional `parameter`, and
optional `sourceUrl`. The allowed capability codes are `invalid_input`,
`not_found`, `source_unavailable`, `source_changed`, `partial_retrieval`, and
`internal_failure`.

| Operation | Inputs and defaults | Result inventory | Warnings | Failures |
| --- | --- | --- | --- | --- |
| `search-standards` | `keyword`; `limit` 1–100 default 20; `sort` = `relevance` default, `match-count`, `std-num`, or `title` | normalized request; total match/standard/returned counts; standards with `stdNum`, optional title/kind, match count, API reference, and structure next action; suggested keywords | `truncated_results`, `source_metadata_incomplete` | `invalid_input`, `source_unavailable`, `source_changed` |
| `get-standard-structure` | `stdNum`; optional `keyword` | normalized request; ordered sections with `indexDocumentId`, `stdNum`, title, ref, level, optional document type, parent ids, optional sort; returned count; structure reference | `search_filtered_structure`, `source_metadata_incomplete` | `invalid_input`, `not_found`, `source_unavailable`, `source_changed` |
| `get-section` | `stdNum`; exactly one of `indexDocumentId`/`ref`; optional `keyword` | normalized request; resolved section identity/context; ordered title/paragraph/unknown clauses with content and citation fields; section reference | `ambiguous_ref_resolved`, `empty_section`, `partial_clause_normalization` | `invalid_input`, `not_found`, `source_unavailable`, `source_changed`, `partial_retrieval` |
| `get-paragraph` | `stdNum`, exact `paraNum` | normalized request; paragraph identity, parent `indexDocumentId`, best-effort standard/section context, HTML/plain content, optional sort/FAQ metadata; paragraph reference | `paragraph_metadata_incomplete` | `invalid_input`, `not_found`, `source_unavailable`, `source_changed` |
| `search-qna` | `keyword`; `page` 1–1000 default 1; `rows` 1–50 default 10; optional normalized numeric `types`; optional `sortDate`, inclusive `from`/`to` | normalized request; Q&A items with identity/type/label/title/snippet/tags/deprecation/link/date/reference; returned/total/page counts, next-page state, pagination status, counts/labels by type, suggested keywords | `source_metadata_incomplete` | `invalid_input`, `source_unavailable`, `source_changed` |
| `get-qna` | nonnumeric `docNumber`; optional `keyword` | normalized request; Q&A identity/type/label/title/reference/full text; optional HTML, related standards, links, dates, adjacent ids; tags/deprecation; Q&A reference | `source_metadata_incomplete` | `invalid_input`, `not_found`, `source_unavailable`, `source_changed` |

Every input object is closed, trims required ECMAScript whitespace, omits blank
optional strings, and rejects unknown keys with camelCase recovery hints.
Default standard search uses title relevance and match count rather than source
order. Section ref ambiguity resolves to the deepest stable candidate. Exact
paragraph forms include `23`, `한2.1`, `B3`, and `BC240A`; ranges direct callers
to section retrieval. Q&A date controls are bounded client-side behavior, and
the CLI keeps `--limit` as the `rows` alias.

Caller cancellation is distinct execution control. The Node SDK/toolset
projects it as a `KasbToolsetError` with `code: "aborted"`,
`recoverable: false`, `retryable: true`, and the canonical `operationName`; it
must not copy the lower-level TypeScript fetch quirk that classified abort as
`source_unavailable`.
`get-qna` continues to allow `source_metadata_incomplete`, although the current
fixture path emits no warning.

## CLI process surface

- Preserve all six kebab-case commands, `kasb help <command>`, and
  `<command> --help`.
- Preserve the current flags: `--keyword`, `--limit`, `--sort`, `--std-num`,
  `--index-document-id`, `--ref`, `--para-num`, `--page`, `--rows`, `--types`,
  `--sort-date`, `--from`, `--to`, `--doc-number`, `--output`, and `--pretty`
  where each current command exposes them.
- Successful operations emit exactly one newline-terminated JSON envelope on
  stdout and exit 0. Operation and parse failures emit exactly one
  newline-terminated JSON failure envelope on stdout, leave stderr empty, and
  exit 1. Human help exits 0 without a JSON failure.
- Preserve failure transport metadata version `1`, CLI flag recovery metadata,
  command-local suggestions, the get-section structure next action, and the
  Q&A `--limit` alias in diagnostics.
- When both `search-qna --rows` and `--limit` are present, `--limit` wins
  regardless of argument order. This preserves the frozen alias behavior.
- Embedded `command` and `nextCommands` strings keep one stable illustrative
  quoting form on every target. Their structured `operation` and `input`
  siblings are the shell-independent recovery contract.
- SIGINT and SIGTERM remain process-control events: the CLI installs no
  transport-local `aborted` envelope and produces no operation JSON after the
  operating system terminates it. The later npm launcher must forward the
  signal contract unchanged.
- `kasb help <unknown>` follows the normative parse-failure contract above.
  The transition CLI's silent exit for that one shape is a known TypeScript
  transport defect, not replacement behavior.
- `structured` remains the default. `summary` replaces only `result` with the
  approved compact projection. `raw` may remain equal to `structured` until a
  richer already-public result exists; it never exposes raw provider payloads.
- Preserve the CLI-only `nextCommands.getStandardStructure` projection on
  standard search results.
- Intentional replacement difference: summary truncation still counts the
  frozen JavaScript UTF-16 unit limits, but if the boundary falls between an
  astral scalar's surrogate pair, Rust backs up to the preceding complete
  scalar before appending the ellipsis. The transition TypeScript CLI can emit
  an escaped lone surrogate in this pathological case; replacement JSON stays
  Unicode-scalar-valid instead.

The exact command/flag matrix is:

| Command | Flags beyond help |
| --- | --- |
| `search-standards` | `--keyword`, `--limit`, `--sort`, `--pretty` |
| `get-standard-structure` | `--std-num`, `--keyword`, `--output summary\|structured\|raw`, `--pretty` |
| `get-section` | `--std-num`, `--index-document-id`, `--ref`, `--keyword`, `--output summary\|structured\|raw`, `--pretty` |
| `get-paragraph` | `--std-num`, `--para-num`, `--pretty` |
| `search-qna` | `--keyword`, `--page`, `--rows`, `--limit`, `--types`, `--sort-date`, `--from`, `--to`, `--output summary\|structured\|raw`, `--pretty` |
| `get-qna` | `--doc-number`, `--keyword`, `--output summary\|structured\|raw`, `--pretty` |

## Distribution and validation

The npm executable becomes a shell-free resolver/launcher only. It forwards
arguments, environment, working directory, standard streams, signals, and the
child exit status without parsing commands or rendering output. Each
exact-version native package contains the Node addon and same-revision Rust CLI
binary. `native-targets.json` is only a planned matrix until native build and
clean-consumer checks pass on every target.

Committed fixtures and expected outcomes are reviewed evidence, never output
from routine validation. The process judge compares exact serialized values
except `metadata.fetchedAt`, rejects its deliberate wrong controls first, and
adds surface-specific assertions for CLI process behavior and Node
cancellation/throw projection.
