# kasb

KASB 기준서와 Q&A 자료를 검색하고 조회하는 read-only tool package입니다.

이 패키지는 `kasb` CLI, 런타임 중립 TypeScript toolset export(`./toolset`), Pi adapter export(`./pi`)를 제공합니다. npm/npx 환경에서는 Node.js 20.18.1 이상으로 실행되며, 소스 개발과 테스트는 Bun을 사용합니다. CLI 명령과 옵션은 README에 복제하지 않습니다. 현재 사용법은 CLI help 메시지를 기준으로 확인하세요 (`--help`).

Command success emits one JSON envelope to stdout. Command failure emits one JSON failure envelope to stdout with a nonzero exit code. Help output remains human-readable. The neutral toolset owns operation discovery, schemas, validation, execution, and error serialization; the Pi adapter wraps that same toolset as one action-oriented host tool.

KASB 공개 웹 동작을 읽기 전용으로 사용하므로 KASB 변경의 영향을 받을 수 있습니다.

## License

Elastic License 2.0. See [LICENSE.md](./LICENSE.md).
