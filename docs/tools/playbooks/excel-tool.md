# Excel Tool Playbook

Use [../contracts.md](../contracts.md) for shared contract rules and [../evaluation.md](../evaluation.md) for eval structure. This playbook only covers spreadsheet-specific design choices.

## Goal

Reading spreadsheets for agents is not "convert workbook to CSV." The job is to expose workbook structure, sheet semantics, header logic, and table boundaries so the agent does not have to reverse-engineer them.

## Recommended Operations

- `inspect_workbook`
  Sheet names, dimensions, hidden sheets, merged cells, named ranges
- `list_tables`
  Structured tables and detected table-like regions
- `read_range`
  Exact cells with coordinates and formatting hints
- `read_table`
  Header-aware rectangular extraction
- `find_sheets`
  Fuzzy find sheets by topic or keyword
- `profile_sheet`
  Detect title rows, header rows, blank separators, footnotes

## Spreadsheet-Specific Requirements

- `structural fidelity`
  Preserve `sheet_name`, row and column indices, `cell_address`, display value, raw value, and useful type or formatting hints.
- `header handling`
  Expose merged ranges, inferred header rows, normalized header paths, and confidence flags when inference is uncertain.
- `display vs normalized values`
  Keep user-visible values separate from normalized numbers or dates.

## Good Agent-Facing Abstractions

- `extract_primary_table`
- `find_sheet_with_columns`
- `read_table_by_header_match`
- `summarize_workbook_layout`

## Hard Cases

- hidden sheets with important data
- merged cells that break naive CSV export
- formulas with stale cached values
- locale-specific number and date formats
- multi-table sheets
- footnotes embedded inside the table area
