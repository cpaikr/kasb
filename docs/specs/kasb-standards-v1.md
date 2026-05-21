# KASB Standards v1 Spec

## 1. Identity

- `name`: `kasb-standards`
- `owner`: repo-local spec
- `status`: implemented draft contract; hardening in progress
- `domain`: Korean accounting standards access
- `users`: LLM agents, agent developers, researchers, and humans using the CLI

## 2. Problem

Agents need deterministic access to KASB standards content without replaying browser flows or inferring citations from HTML.

Generic browsing is insufficient because:

- the useful source surface is an underlying JSON API, not the browser route structure
- section and paragraph retrieval depend on source-specific identifiers
- route-facing `titleDocumentId` and retrieval-facing `indexDocumentId` differ
- citations need stable standard, section, and paragraph references

## 3. Capability Boundary

This tool provides read-only CLI access to public KASB standards content through the current `https://db.kasb.or.kr/api/` surface.

In scope:

- standard search
- standard structure lookup
- section retrieval
- exact paragraph retrieval
- Q&A search
- Q&A document retrieval
- stable references and source metadata
- JSON Schemas exported from the same contracts used at runtime
- Commander CLI commands for the v1 operations

Out of scope:

- browser automation as the primary access path
- legal or accounting interpretation
- mutation, login, or account features
- route-id support via `titleDocumentId`
- broad multi-source abstraction
- database persistence or background ingestion
- MCP, SDK, or Pi-native adapters

## 4. Domain Model

### Primary Entities

- `Standard`
  Public standard-level record keyed by `stdNum`.
- `Section`
  Structural node keyed by `stdNum + indexDocumentId`.
- `Paragraph`
  Exact paragraph keyed by `stdNum + paraNum`.

### Stable Identifiers

- `stdNum`
  Public standard identifier. Example: `1116`.
- `indexDocumentId`
  Public v1 section retrieval identifier. Example: `ZB2hJW`.
- `paraNum`
  Public paragraph identifier within one standard. Examples: `23`, `한2.1`, `B3`, `BC240A`.
- `docNumber`
  Public Q&A document identifier. Example: `SSI-35629`.

### Derived Or Internal Identifiers

- `uniqueKey`
  Derived paragraph key in the form `{stdNum}-{paraNum}`. Return it when available, but do not require it as input.
- `titleDocumentId`
  Browser-route-facing id. Keep it internal in v1.
- `bigSeq`, `midSeq`, `smallSeq`, `littleSeq`
  UI ordering fields. Do not expose them as public ids.

### Reference Model

- standard reference: `{ stdNum }`
- section reference: `{ stdNum, indexDocumentId }`
- paragraph reference: `{ stdNum, paraNum }`

Returned references should also include:

- `uniqueKey` when available
- parent `indexDocumentId` for paragraph results, normalized from the upstream paragraph `documentId`
- source API URL
- section title and `ref` when available

### v1 Rules

- accept `indexDocumentId` directly for section retrieval
- accept `stdNum + paraNum` directly for exact paragraph retrieval
- do not accept `titleDocumentId` as a public input
- treat `stdNum + paraNum` as the canonical citation key
- return API URLs as the guaranteed source URL; user-facing route URLs are optional later CLI metadata only if they can be derived safely

## 5. Contract Conventions

### Naming

- Operation ids and CLI commands use kebab-case.
- JSON request fields use camelCase.
- CLI flags use kebab-case.

Examples:

| Operation | JSON field | CLI flag |
|---|---|---|
| `search-standards` | `keyword` | `--keyword` |
| `search-standards` | `sort` | `--sort` |
| `get-standard-structure` | `stdNum` | `--std-num` |
| `get-section` | `indexDocumentId` | `--index-document-id` |
| `get-section` | `ref` | `--ref` |
| `get-paragraph` | `paraNum` | `--para-num` |
| `search-qna` | `keyword` | `--keyword` |
| `search-qna` | `rows` | `--rows`, `--limit` alias |
| `search-qna` | `sortDate` | `--sort-date` |
| `search-qna` | `from`, `to` | `--from`, `--to` |
| `get-qna` | `docNumber` | `--doc-number` |

### Success Envelope

Each operation returns a success envelope with:

- `result`: operation-specific payload
- `metadata`: source endpoint, timing, routine content-format notes, and completeness flags
- `references`: citeable identifiers and source URLs surfaced at the operation level
- `warnings`: non-fatal partial retrieval, normalization uncertainty, source drift hints, ambiguity, empty sections, truncation, or fallback use

The success schema does not contain an `error` field.

### Typed Failures

Failures are separate typed values or thrown capability failures. A public failure should include:

- `code`
- `message`
- `retryable`
- `parameter` when one input caused the failure
- `sourceUrl` when the source was contacted

CLI failure envelopes may also include transport-local recovery fields:

- `cliOption` when validation can identify the exact CLI flag used, including aliases such as `--limit`
- `nextAction` when a safe, concrete follow-up command can help the caller recover

Allowed public failure codes:

- `invalid_input`
- `not_found`
- `source_unavailable`
- `source_changed`
- `partial_retrieval`
- `internal_failure`

### Output Modes

The first implementation supports structured output by default. High-volume CLI commands (`get-standard-structure`, `get-section`, `search-qna`, and `get-qna`) also accept `--output summary|structured|raw` without changing the shared capability contracts or the JSON CLI operation-output rule.

Every operation output mode still emits a JSON envelope:

- `structured`: schema-first `result` payload for downstream use
- `summary`: concise JSON `result` projection over the structured result; operation-level `metadata`, `references`, and `warnings` are preserved
- `raw`: the richest available structured envelope, including preserved source HTML fields already normalized into the public result shape

## 6. Operations

### `search-standards`

- `purpose`
  Find standards relevant to a keyword before deeper retrieval.
- `inputs`
  `keyword`, optional `limit`, optional `sort` (`relevance`, `match-count`, `std-num`, `title`; default `relevance`)
- `output`
  Matching standards with `stdNum`, match counts, best-effort `standardTitle` / `standardKind`, source references, per-standard transport-neutral `nextActions` for the normal structure lookup follow-up, and broader `suggestedKeywords`.
- `warnings`
  `truncated_results`, `source_metadata_incomplete`
- `failure cases`
  `invalid_input`, `source_unavailable`, `source_changed`
- `safety class`
  read-only

Implementation notes:

- Map public `keyword` to source parameter `searchWord`.
- Use `GET /api/standard?searchWord={keyword}`.
- Do not hide the source's match-count behavior; expose enough metadata to explain ranking or truncation.
- Include a `nextActions.getStandardStructure` action for each result so agent tools can call the follow-up operation without translating API URLs; CLI transport may render that action as `kasb get-standard-structure --std-num ... --output summary`.
- Default search UX should use relevance ranking rather than source order because observed `/api/standard` order is not `doc_count` relevance order.

### `get-standard-structure`

- `purpose`
  Return the searchable section tree for one standard and surface `indexDocumentId` values.
- `inputs`
  `stdNum`, optional `keyword`
- `output`
  Section nodes with `indexDocumentId`, `title`, `ref`, `level`, `documentType`, and `parentDocumentIds`.
- `warnings`
  `search_filtered_structure`, `source_metadata_incomplete`
- `failure cases`
  `invalid_input`, `not_found`, `source_unavailable`, `source_changed`
- `safety class`
  read-only

Implementation notes:

- Use `GET /api/standard-indexes/{stdNum}` without search.
- Map optional public `keyword` to source parameter `searchWord`.
- Use `GET /api/standard-indexes/{stdNum}/searchWord?searchWord={keyword}` when `keyword` is supplied.
- Do not expose `/api/title/{stdNum}` ids as public section ids.

### `get-section`

- `purpose`
  Fetch one section by the retrieval id the source actually uses for content lookup.
- `inputs`
  `stdNum`, either `indexDocumentId` or `ref`, optional `keyword`
- `output`
  Section metadata plus ordered title/paragraph clauses. Title clauses may include source title text. Ref-based lookups return the resolved `indexDocumentId` in references and section metadata. When the structure index can be checked, section output and references also include best-effort `standardTitle`, `standardKind`, and resolved `ref` context.
- `warnings`
  `ambiguous_ref_resolved`, `empty_section`, `partial_clause_normalization`
- `failure cases`
  `invalid_input`, `not_found`, `source_unavailable`, `source_changed`, `partial_retrieval`
- `safety class`
  read-only

Implementation notes:

- Use `GET /api/paragraphs/{stdNum}/{indexDocumentId}`.
- For `ref` input, resolve the ref through `GET /api/standard-indexes/{stdNum}` first, then fetch the resolved section id.
- If multiple structure nodes share a ref, choose the most specific deepest node and return `ambiguous_ref_resolved`.
- Map optional public `keyword` to source parameter `searchWord`.
- Include the source `searchWord` parameter only when requested.
- If the section response is empty and the requested id is not present in the standard structure, surface a typed failure instead of silently treating the response as a valid empty section.
- Treat route-facing `titleDocumentId` values as invalid public input unless a later spec adds an explicit mapping operation.
- Record routine `paraContent` HTML preservation in `metadata.content`, not as a warning.

### `get-paragraph`

- `purpose`
  Fetch one exact paragraph by stable paragraph reference.
- `inputs`
  `stdNum`, `paraNum`
- `output`
  One paragraph record with `paraNum`, `uniqueKey`, `fullContent`, `paraContent`, parent `indexDocumentId`, and best-effort containing-standard/section context (`standardTitle`, `standardKind`, `sectionTitle`, `sectionRef`) when the structure index can be checked.
- `warnings`
  `paragraph_metadata_incomplete`
- `failure cases`
  `invalid_input`, `not_found`, `source_unavailable`, `source_changed`
- `safety class`
  read-only

Implementation notes:

- Use `GET /api/paragraphs/content/{stdNum}/{paraNum}`.
- Normalize the direct paragraph response into a single exact result or a typed `not_found` failure.
- Direct paragraph lookup should not require the caller to know the section id.
- Reject paragraph ranges such as `22~30` as `invalid_input` and direct callers to `get-section --ref`.
- Record routine `paraContent` HTML preservation in `metadata.content`, not as a warning.

### `search-qna`

- `purpose`
  Find KASB Q&A and interpretation material relevant to a keyword.
- `inputs`
  `keyword`, optional `page`, optional `rows`, optional source-facing numeric `types` CSV, optional `sortDate` (`asc` or `desc`), optional inclusive `from`/`to` publish-date bounds in `YYYY-MM-DD` form. The CLI also accepts `--limit` as an alias for `rows`.
- `output`
  Matching Q&A records with `docNumber`, source type, observed type label, title, compact snippet, tags, source links, source `publishDate` when available, per-type counts, type-label lookup metadata, pagination metadata (`totalCount`, `totalPages`, `hasNextPage`, `paginationStatus`), and zero-result `suggestedKeywords` for broader or spacing-normalized follow-up searches.
- `warnings`
  `source_metadata_incomplete`
- `failure cases`
  `invalid_input`, `source_unavailable`, `source_changed`
- `safety class`
  read-only

Implementation notes:

- Use `GET /api/qnas/v2?types={csv}&searchWord={keyword}&page={page}&rows={rows}`.
- Default observed public `types` to `11,12,13,14,15,24,25`.
- The observed source endpoint does not accept date sort/filter parameters; `sortDate`, `from`, and `to` are applied client-side to source `publishDate` across a bounded Q&A search window. When the bounded scan cannot cover all matching source rows, return partial metadata and a warning.
- Treat `types` as an explicit v1 exception to the usual semantic-field rule; keep type numbers source-facing until a later spec promotes semantic type names.
- Return observed labels for known public type ids to make source-facing numbers scannable; labels are descriptive metadata, not accepted semantic inputs.
- Reject malformed non-numeric `types` CSV values as `invalid_input`; normalize spaces around comma-separated numeric ids.
- Record routine highlight HTML-to-text normalization in `metadata.content`, not as a warning.

### `get-qna`

- `purpose`
  Fetch one Q&A document by stable source document number.
- `inputs`
  `docNumber`, optional `keyword`
- `output`
  One Q&A record with `docNumber`, source type, observed type label, title, full plain content, optional HTML content, related standards HTML, tags, adjacent document numbers, and source links.
- `warnings`
  `source_metadata_incomplete`
- `failure cases`
  `invalid_input`, `not_found`, `source_unavailable`, `source_changed`
- `safety class`
  read-only

Implementation notes:

- Use `GET /api/qnas/v2/{docNumber}`.
- Include source `searchWord` only when optional `keyword` is supplied.
- Treat `contentHtml` and related-standards fragments as source HTML; preserve them rather than inventing lossy citations.
- Reject numeric-only `docNumber` values as `invalid_input` and direct callers to recover the full identifier through `search-qna`.
- Record routine HTML preservation in `metadata.content`, not as a warning.

## 7. CLI Transport

The only planned public interface is the Commander CLI.

The CLI should:

- expose one command per v1 operation
- accept kebab-case flags
- emit JSON for operation success and failure output; Commander help may remain human-readable
- write success envelopes to `stdout` with exit code `0`
- write failure envelopes to `stderr` with a nonzero exit code and empty `stdout`
- do not mix human-readable diagnostics into operation output; any diagnostic mode must stay parseable, such as JSON lines on `stderr` or a separate diagnostic file
- keep help text, examples, and output presentation outside capability contracts
- make `kasb help <command>` and `<command> --help` both exit successfully without JSON failure envelopes

Success envelope shape:

```json
{
  "result": {},
  "metadata": {},
  "references": {},
  "warnings": []
}
```

Failure envelope shape:

```json
{
  "failure": {
    "code": "invalid_input",
    "message": "필수 옵션 \"--index-document-id\" 또는 \"--ref\" 중 정확히 하나가 필요합니다. \"--index-document-id\"는 get-standard-structure 결과에서 가져오며, 브라우저 경로의 titleDocumentId는 사용할 수 없습니다.",
    "retryable": false,
    "parameter": "indexDocumentId",
    "nextAction": {
      "operation": "get-standard-structure",
      "input": { "stdNum": "1019" },
      "command": "kasb get-standard-structure --std-num 1019 --output summary",
      "reason": "get-section에는 indexDocumentId 또는 ref가 필요합니다. get-standard-structure가 해당 기준서의 후보 섹션과 indexDocumentId/ref를 반환합니다."
    }
  },
  "metadata": {
    "cliTransportVersion": "1",
    "operation": "get-section"
  },
  "warnings": []
}
```

## 8. Source Adapter Rules

KASB source adapters should own:

- source URL construction
- source response schemas
- fetch and timeout behavior
- source-level error detection
- normalization from KASB payloads into provider-facing results

Public capability modules should not import raw KASB response types. The source adapter may know both public requests and internal source shapes at the mapping boundary.

## 9. Safety Model

- read-only only
- no auth required in current evidence
- conservative retry on transient upstream failures
- source-shape drift becomes `source_changed`
- invalid or stale ids become `not_found` or `invalid_input` depending on whether the input shape was valid
- log request inputs, source endpoint, and identifier classification decisions when diagnostics are enabled

## 10. Evaluation Plan

Target deterministic scenarios:

- search `리스` and retrieve standard `1116`
- list section nodes for `1116` and surface `ZB2hJW`
- fetch section `1116 / ZB2hJW` and return paragraphs `1` and `2`
- fetch paragraphs `1116 / 23`, `1116 / 한2.1`, `1116 / B3`, and `1116 / BC240A`
- reject or fail cleanly for route-facing `titleDocumentId` inputs when they do not resolve to section content

Success criteria:

- identifiers accepted by the contract match the identifiers needed by the live source
- every paragraph result is citeable by `stdNum + paraNum`
- every section result includes enough metadata to continue traversal or cite the source
- upstream id mismatches become typed failures or documented constraints, not silent ambiguity
- CLI output is one parseable JSON envelope on success and one parseable JSON failure envelope on failure

## 11. Open Questions

No blocking contract questions remain for v1.

Likely later extensions:

- best-effort user-facing route URLs
- richer standard metadata
- reference following between cited standards and paragraphs
- interpretation-material capabilities if source evidence supports them
