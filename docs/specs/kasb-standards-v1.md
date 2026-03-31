# KASB Standards v1 Spec

## 1. Identity

- `name`: `kasb-standards`
- `owner`: repo-local spec
- `status`: draft
- `domain`: Korean accounting standards access
- `users`: LLM agents, agent developers, researchers

## 2. Problem

Agents need deterministic access to KASB standards content without replaying browser flows or inferring citations from HTML.

Generic browsing is insufficient because:

- the useful surface is an underlying JSON API, not the browser route structure
- section and paragraph retrieval depend on source-specific identifiers
- the route-facing `titleDocumentId` and retrieval-facing `indexDocumentId` differ
- citations need stable standard and paragraph references

## 3. Capability Boundary

This tool provides read-only access to public KASB standards content through the current `https://db.kasb.or.kr/api/` surface.

In scope:

- standard search
- standard structure lookup
- section retrieval
- exact paragraph retrieval
- stable references and source metadata

Out of scope:

- browser automation
- legal or accounting interpretation
- mutation, login, or account features
- route-id support via `titleDocumentId`
- broad multi-source abstraction

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
  Public standard identifier.
- `indexDocumentId`
  Public v1 section retrieval identifier.
- `paraNum`
  Public paragraph identifier within one standard.

### Derived Or Internal Identifiers

- `uniqueKey`
  Derived paragraph key in the form `{stdNum}-{paraNum}`. Return it, but do not require it as input.
- `titleDocumentId`
  Route-facing browser id. Keep it internal in v1.
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
- return API URLs as the guaranteed source URL; user-facing route URLs are optional future work

## 5. Operations

### `search_standards`

- `purpose`
  Find standards relevant to a keyword before deeper retrieval.
- `inputs`
  `search_word`, optional `limit`
- `output`
  Matching standards with `stdNum`, match counts, and any available display metadata the tool can derive without route-only ids
- `error cases`
  `invalid_input`, `source_unavailable`, `source_changed`
- `safety class`
  read-only

### `get_standard_structure`

- `purpose`
  Return the searchable section tree for one standard and surface `indexDocumentId` values.
- `inputs`
  `std_num`, optional `search_word`
- `output`
  Section nodes with `indexDocumentId`, `title`, `ref`, `level`, `documentType`, `parentDocumentIds`
- `error cases`
  `invalid_input`, `not_found`, `source_unavailable`, `source_changed`
- `safety class`
  read-only

### `get_section`

- `purpose`
  Fetch one section by the retrieval id the source actually uses for content lookup.
- `inputs`
  `std_num`, `index_document_id`, optional `search_word`
- `output`
  Section metadata plus ordered clauses and paragraph rows
- `error cases`
  `invalid_input`, `not_found`, `source_unavailable`, `source_changed`, `partial_extraction`
- `safety class`
  read-only

Implementation rule:

- if the section response is empty and the requested id is not present in the standard structure, surface a typed error instead of silently treating the response as a valid empty section

### `get_paragraph`

- `purpose`
  Fetch one exact paragraph by stable paragraph reference.
- `inputs`
  `std_num`, `para_num`
- `output`
  One paragraph record with `paraNum`, `uniqueKey`, `fullContent`, `paraContent`, and parent `indexDocumentId`
- `error cases`
  `invalid_input`, `not_found`, `source_unavailable`, `source_changed`
- `safety class`
  read-only

Implementation rule:

- require the tool layer to normalize the direct paragraph response into a single exact result or a typed `not_found` error

## 6. Transport Adapters

- CLI: yes
  Useful for manual verification, fixtures, and scripts.
- MCP: later
  Add only after the core contract and error model are stable.
- SDK: yes
  The deterministic core should be reusable without transport assumptions.

## 7. Output Modes

- `summary`
  Small, agent-readable overview with the top references.
- `structured`
  Default mode for downstream use.
- `raw`
  Preserve upstream HTML fragments and raw text where relevant.

## 8. Safety Model

- read-only only
- no auth required in current evidence
- conservative retry on transient upstream failures
- detect source-shape drift and surface `source_changed`
- log request inputs, source endpoint, and identifier classification decisions

## 9. Evaluation Plan

Target scenarios:

- search `리스` and retrieve standard `1116`
- list section nodes for `1116` and surface `ZB2hJW`
- fetch section `1116 / ZB2hJW` and return paragraphs `1` and `2`
- fetch paragraphs `1116 / 23`, `1116 / 한2.1`, `1116 / B3`, and `1116 / BC240A`
- reject route-facing `titleDocumentId` inputs for section retrieval when they do not resolve to section content

Success criteria:

- identifiers accepted by the contract match the identifiers needed by the live source
- every paragraph result is citeable by `stdNum + paraNum`
- every section result includes enough metadata to continue traversal or cite the source
- upstream id mismatches become typed errors or documented constraints, not silent ambiguity

## 10. Open Questions

No blocking contract questions remain for v1.

Likely future extensions:

- best-effort user-facing route URLs
- richer standard metadata
- reference following between cited standards and paragraphs
