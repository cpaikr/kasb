# Site Data Tool Playbook

Use [../contracts.md](../contracts.md) for shared contract rules and [../evaluation.md](../evaluation.md) for eval structure. This playbook covers domain-access tools built on top of real site APIs or stable request patterns.

## Goal

When a target site has underlying APIs or stable request patterns, do not make agents browse it like humans. Build a domain access tool instead.

Examples:

- `https://dart.fss.or.kr/`
- `https://db.kasb.or.kr/standard/`

## Recommended Design Sequence

1. `Investigate the source`
   Reverse engineer network calls, request parameters, response payloads, pagination, auth, anti-bot behavior, identifier schemes, and update cadence.
2. `Define the domain model`
   Model stable concepts such as company, filing, document, standard, section, attachment, effective date, and revision.
3. `Define capability operations`
   Expose semantic operations instead of UI-driven flows.
4. `Package for agents`
   Return concise summaries plus structured references rather than raw html.

## Example Operations

- `search_companies`
- `search_filings`
- `get_filing`
- `list_filing_documents`
- `get_document_section`
- `search_standards`
- `get_standard_version`
- `compare_standard_revisions`

## What To Avoid

- exposing only a generic `search(query)` endpoint,
- leaking fragile UI parameters into the public contract,
- returning scraped html fragments when a cleaner domain object is possible,
- forcing the agent to manage pagination manually when the tool can abstract it.

## Hard Cases

- undocumented parameters
- session cookies
- anti-bot checks
- mixed html and api flows
- inconsistent ids across pages
- source-side terminology drift
- retroactive correction of historical records
