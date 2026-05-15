# Transport Decision

## Short Answer

This repo is CLI-only.

The practical shape is:

- implement a reusable core
- expose it through a Commander CLI
- keep other transports out of scope unless the product direction changes

## Recommendation For This Repo

Adopt `capability core + thin CLI`, matching `../darty`.

The CLI should mostly:

- parse command-line input
- apply command help and examples
- call the shared app/capability layer
- serialize success envelopes as JSON on `stdout`
- serialize failure envelopes as JSON on `stderr` with nonzero exit codes

Do not fork logic between CLI commands and source adapters. The CLI should not call KASB endpoints directly.

## Why CLI First Wins Here

- easiest to test manually
- easiest to profile and benchmark
- easiest to inspect failure modes
- least coupled to one agent ecosystem
- works well for subprocess-based agent use

## Out Of Scope

- MCP handlers
- SDK packages
- Pi-native tools
- database persistence or background ingestion
- HTTP wrappers

These can be reconsidered only if the product docs change. They are not current implementation targets.

## Anti-Patterns

- putting domain logic in CLI command files
- designing outputs around human terminal readability only
- printing non-JSON failure text that subprocess callers must special-case
- forcing agents to chain multiple shell-oriented commands when one semantic call should exist
- using a skill to compensate for a poor tool contract
- returning giant unfiltered dumps because "the model can figure it out"
