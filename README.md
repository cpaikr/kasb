# kasb

A read-only tool package for searching and retrieving KASB standards and Q&A material.

This package provides the `kasb` CLI, a runtime-neutral TypeScript toolset export (`./toolset`), and a Pi adapter export (`./pi`). npm/npx usage requires Node.js 20.18.1 or newer; source development and tests use Bun. CLI commands and options are not duplicated in this README. Treat CLI help as the current usage reference (`--help`).

Command success emits one JSON envelope to stdout. Command failure emits one JSON failure envelope to stdout with a nonzero exit code. Help output remains human-readable. The neutral toolset owns operation discovery, schemas, validation, execution, and error serialization; the Pi adapter wraps that same toolset as one action-oriented host tool.

This package reads observed public KASB web/API behavior in read-only mode, so upstream KASB changes can affect results.

## License

Elastic License 2.0. See [LICENSE.md](./LICENSE.md).
