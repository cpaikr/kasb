# PDF Tool Playbook

Use [../contracts.md](../contracts.md) for shared contract rules and [../evaluation.md](../evaluation.md) for eval structure. This playbook only covers PDF-specific design choices.

## Goal

Do not expose "read pdf" as one vague operation. Split the capability into semantically distinct operations.

## Recommended Operations

- `inspect_pdf`
  Metadata, page count, encryption, scanned-vs-digital hints
- `extract_text`
  Text by page, block, or reading order
- `extract_tables`
  Table candidates with page and cell references
- `extract_sections`
  Heading-aware segmentation when possible
- `extract_spans`
  Fine-grained text spans with coordinates for citation
- `render_page`
  Image rendering for fallback inspection

## PDF-Specific Requirements

- `provenance`
  Preserve `page`, `block_id` or `span_id`, optional `bbox`, extraction method, and confidence or warning flags.
- `strategy awareness`
  Distinguish text-layer extraction, layout-aware extraction, and OCR fallback.
- `targeted access`
  Favor inspect-first and section-first flows over dumping an entire document by default.

## Good Agent-Facing Abstractions

- `find_section_by_heading`
- `extract_table_near_heading`
- `quote_text_at_reference`
- `list_pages_matching_keywords`

These are usually more useful than forcing the model to scan a full document dump.

## Hard Cases

- image-only PDFs
- broken text ordering
- multi-column layouts
- footnotes mixed into paragraphs
- rotated tables
- duplicate headers across pages
- encrypted or permission-limited files
