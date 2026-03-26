# Portfolio Strategy

## Goal

This doc is about what should be shared across multiple tools. For the design of any one tool contract, see [contracts.md](contracts.md).

## Standardize These

Across a real tool portfolio, the following conventions usually pay off:

- `identity`
  Stable ids for documents, entities, sections, tables, and files.
- `reference format`
  A consistent way to point back to source evidence.
- `result envelope`
  Consistent placement of `result`, `metadata`, `warnings`, and `error`.
- `fetch policy`
  Timeout, retry, cache, freshness, and rate-limit rules.
- `safety classes`
  Read-only, mutating, destructive, privileged.
- `observability`
  Request ids, trace ids, source version, adapter version.
- `eval artifact shape`
  Comparable scenario docs, fixtures, and benchmark notes.

If each tool invents these independently, the agent experience fragments quickly.

## Do Not Over-Standardize

Keep shared discipline at the edges, not in every payload.

Do not force the same:

- operation set across unrelated domains,
- result payload schema across tool families,
- transport choice for every capability,
- abstraction level when a domain needs a different boundary.

## Useful Taxonomy

Tag each tool along a few common axes:

- `domain`
  document, financial, filesystem, browser, internal-system
- `interaction type`
  extract, search, lookup, transform, mutate
- `safety class`
  read-only, approval-needed, destructive
- `latency class`
  fast-sync, slow-sync, async-job
- `state model`
  stateless, session-based, cached, long-running

This helps align transport, runtime policy, and evaluation.

## Reuse Opportunities

PDF, Excel, site-data, and filesystem tools can often share:

- reference conventions,
- warning semantics for partial results,
- pagination and chunking patterns,
- cache and freshness metadata,
- eval document structure.

That shared substrate is where a framework repo creates leverage.
