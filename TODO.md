# TODO

## Now

- Search ranking follow-up.
  - Default `search-standards` now ranks by relevance, adds `--sort relevance|match-count|std-num|title`, and has representative tests for `리스`, `수익인식`, `충당부채`, and `종업원급여`.
  - Remaining useful checks:
    - Monitor live KASB ordering/source drift for ranking regressions.
    - Revisit whether source order deserves an explicit sort mode only if users need to inspect upstream order.
    - Investigate noisy keyword-filtered structure results. Agent tryouts found `get-standard-structure --std-num 1115 --keyword 수행의무` returned many body, example, and BC sections; users wanted ranking, limiting, or clearer prioritization before choosing `get-section`.
    - Continue improving title enrichment where source metadata is unavailable. Agent tryouts saw titleless legacy results such as `1017`, `1018`, and `1011`, which made search results harder to judge.
    - Investigate Korean spacing normalization or guidance. `장기종업원급여` stayed narrow while `장기 종업원 급여` broadened the result set; `1019` still ranked first, so this needs source-sensitive design rather than an immediate rewrite.

- Help lacks end-to-end workflows.
  - Evidence from tryouts:
    - Root help lists commands but does not show how to chain them.
    - Users had to infer workflows such as `search-standards -> get-standard-structure -> get-section -> get-paragraph`.
    - Q&A workflow is not shown: `search-qna -> get-qna`.
    - `get-standard-structure --keyword` and `get-section --ref` are important but under-explained.
  - Useful directions:
    - Add short workflow examples to root help:
      - standards lookup: find `stdNum`, inspect structure, fetch section or exact paragraph
      - Q&A lookup: search Q&A, fetch one `docNumber`
      - comparison: find K-IFRS and general GAAP standards separately
    - Add command-specific examples for common tryouts:
      - `리스` 적용범위: `1116`, ref `3~4`
      - `리스` 식별/정의: `1116`, ref `9~17`, paragraph `9`
      - `장기종업원급여`: `1019`, ref `153~158`
      - `수행의무 식별`: `1115`, ref `22~30`
    - Keep examples in CLI help rather than README command duplication unless README policy changes.

- Errors need next-step guidance.
  - Evidence from tryouts:
    - `get-section --std-num 1019` says `--index-document-id` or `--ref` is required, but does not suggest running `get-standard-structure` first.
    - `get-paragraph --para-num '22~30'` fails with `source_changed`; user intent is a range and should point to `get-section --ref`.
    - `get-qna --doc-number 35629` produced a retryable source failure; likely user meant `SSI-35629`.
    - `search-qna --types abc` is sent upstream and becomes a retryable source failure instead of local `invalid_input`.
    - `search-qna --limit 999` reports parameter `rows`, even when the user typed `--limit`.
    - `search-qna --query 리스` does not suggest `--keyword`.
  - Useful directions:
    - Add actionable suggestions or `nextCommand`-style hints to failure envelopes where safe.
    - Validate Q&A `types` locally as numeric CSV and reject invalid values before fetch.
    - Detect paragraph ranges and route users to `get-section --ref`.
    - Detect common Q&A numeric doc-number mistakes and suggest likely prefixed forms only when evidence is strong.
    - Preserve or mention the user-facing flag name in validation errors, especially aliases like `--limit`.
    - Keep failure output parseable JSON with nonzero exit and empty stdout.

- Q&A UX needs stronger search and recency support.
  - Evidence from tryouts:
    - Exact Q&A searches for `장기종업원급여`, `기타장기종업원급여`, and related compound terms returned zero, while broader `종업원급여` returned many rows.
    - `리스` Q&A results are relevant but not recent-first; newer issues were buried around items 24, 25, and 48.
    - `search-qna` lacks explicit `totalCount`, `totalPages`, and `hasNextPage`; users had to infer counts from `countByType`.
    - Help lists Q&A type numbers but not their meanings.
    - Search snippets can be too long for quick scanning.
  - Useful directions:
    - Add `suggestedKeywords` or fallback hints for zero-result Q&A searches.
    - Add recency controls if source data supports it: `--sort-date desc`, `--from`, `--to`.
    - Add pagination metadata: `totalCount`, `totalPages`, `hasNextPage`.
    - Document Q&A type ids in help or expose labels in output.
    - Consider compact result projection for search output: `docNumber`, type label, title, date, tags, short snippet.

- Comparison workflows need metadata/filtering.
  - Evidence from tryouts:
    - Comparing `충당부채` required manually discovering K-IFRS `1037` and general GAAP `14`.
    - Adding framework words such as `KIFRS` or `일반기업회계기준` often made search worse.
    - `get-section` and `get-paragraph` outputs do not always include `standardTitle` and `standardKind`, so users must remember what `1037` or `14` means.
    - No command retrieves comparable sections across multiple standards.
  - Useful directions:
    - Add `--framework` or `--standard-kind` filter for `search-standards`, e.g. `k-ifrs`, `general-gaap`.
    - Normalize framework synonyms: `KIFRS`, `K-IFRS`, `한국채택국제회계기준`, `일반기업회계기준`.
    - Include `standardTitle` and `standardKind` in section and paragraph retrieval outputs/references.
    - Consider a later comparison-oriented finder only after the primitive search/filter UX is solid.

- JSON/content issues.
  - Evidence from tryouts:
    - Paragraph `fullContent` often collapses numbered items, e.g. `인식한다.(1)`, reducing readability and downstream summarization quality.
    - Raw `contentHtml` and `relStds` are noisy in default human-facing output, though useful for provenance.
    - One Q&A detail output leaked repeated `undefined` in `fullContent`.
    - `get-section --index-document-id` and `get-section --ref` can differ in contextual fields such as `section.ref`.
    - `get-paragraph` returns `indexDocumentId` but not section title/ref, reducing citation context.
    - Structure titles may contain preserved HTML such as `<sup>` without a warning.
  - Useful directions:
    - Improve plain-text normalization around lists, line breaks, and HTML entities.
    - Keep raw HTML available only where contractually useful; consider `--plain`, `--compact`, or `--raw` modes before expanding defaults.
    - Add regression tests for `undefined` leakage.
    - Include section title/ref in paragraph references when source lookup can provide it without extra brittle calls.
    - Make warnings consistent when output preserves or normalizes source HTML.

- Documentation inconsistency.
  - Evidence from tryouts:
    - README says command success and command failure both emit one JSON envelope to stdout.
    - Implemented behavior and architecture say success JSON goes to stdout and failure JSON goes to stderr with nonzero exit.
  - Useful directions:
    - Update README to match implemented/spec behavior unless the product decision changes.
    - Keep CLI help, README, architecture, and tests aligned on stdout/stderr behavior.
    - Add or keep a subprocess test that locks the chosen stream contract.

## Later

- Implement Auth
- Need Rate limiting
