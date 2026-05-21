# TODO

## Now

- Comparison workflows need metadata/filtering.
  - Evidence from tryouts:
    - Comparing `충당부채` required manually discovering K-IFRS `1037` and general GAAP `14`.
    - Adding framework words such as `KIFRS` or `일반기업회계기준` often made search worse.
    - No command retrieves comparable sections across multiple standards.
  - Useful directions:
    - Add `--framework` or `--standard-kind` filter for `search-standards`, e.g. `k-ifrs`, `general-gaap`.
    - Normalize framework synonyms: `KIFRS`, `K-IFRS`, `한국채택국제회계기준`, `일반기업회계기준`.
    - Consider a later comparison-oriented finder only after the primitive search/filter UX is solid.

- JSON/content issues.
  - Evidence from tryouts:
    - Raw `contentHtml` and `relStds` are noisy in default human-facing output, though useful for provenance.
    - Structure titles may contain preserved HTML such as `<sup>` without a warning.
  - Useful directions:
    - Keep raw HTML available only where contractually useful; consider `--plain`, `--compact`, or `--raw` modes before expanding defaults.
    - Make warnings consistent when output preserves or normalizes source HTML.

## Later

- Implement Auth
- Need Rate limiting
- Search ranking follow-up.
  - Default `search-standards` now ranks by relevance, adds `--sort relevance|match-count|std-num|title`, and has representative tests for `리스`, `수익인식`, `충당부채`, and `종업원급여`.
  - Remaining useful checks:
    - Monitor live KASB ordering/source drift for ranking regressions.
    - Revisit whether source order deserves an explicit sort mode only if users need to inspect upstream order.
    - Investigate noisy keyword-filtered structure results. Agent tryouts found `get-standard-structure --std-num 1115 --keyword 수행의무` returned many body, example, and BC sections; users wanted ranking, limiting, or clearer prioritization before choosing `get-section`.
    - Continue improving title enrichment where source metadata is unavailable. Agent tryouts saw titleless legacy results such as `1017`, `1018`, and `1011`, which made search results harder to judge.
    - Investigate Korean spacing normalization or guidance. `장기종업원급여` stayed narrow while `장기 종업원 급여` broadened the result set; `1019` still ranked first, so this needs source-sensitive design rather than an immediate rewrite.
