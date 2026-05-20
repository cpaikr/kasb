import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");

const decode = (value: Uint8Array<ArrayBufferLike>) => new TextDecoder().decode(value);

const runCli = (argv: readonly string[]) =>
  Bun.spawnSync({
    cmd: [process.execPath, "run", "src/cli.ts", ...argv],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });

describe("kasb CLI", () => {
  test("prints root help", () => {
    const result = runCli(["--help"]);
    const stdout = decode(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(decode(result.stderr)).toBe("");
    expect(stdout).toContain("Usage: kasb [options] [command]");
    expect(stdout).toContain("search-standards [options]");
    expect(stdout).toContain("get-standard-structure [options]");
    expect(stdout).toContain("get-section [options]");
    expect(stdout).toContain("get-paragraph [options]");
    expect(stdout).toContain("search-qna [options]");
    expect(stdout).toContain("get-qna [options]");
    expect(stdout).toContain("워크플로:");
    expect(stdout).toContain("kasb get-standard-structure --std-num 1116 --output summary");
    expect(stdout).toContain("kasb search-qna --keyword 리스 --limit 5 --output summary");
  });

  test("prints help subcommand without a JSON failure", () => {
    const result = runCli(["help", "search-standards"]);
    const stdout = decode(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(decode(result.stderr)).toBe("");
    expect(stdout).toContain("Usage: kasb search-standards [options]");
    expect(stdout).toContain("--limit <number>");
    expect(stdout).toContain("--sort <mode>");
  });

  test.each([
    ["get-paragraph", "--para-num <text>"],
    ["get-section", "--output <mode>"],
  ] as const)("prints %s help when no command options are passed", (command, expectedOption) => {
    const result = runCli([command]);
    const stdout = decode(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(decode(result.stderr)).toBe("");
    expect(stdout).toContain(`Usage: kasb ${command} [options]`);
    expect(stdout).toContain("--std-num <text>");
    expect(stdout).toContain(expectedOption);
  });

  test("writes JSON failures to stderr and leaves stdout empty", () => {
    const result = runCli(["get-paragraph", "--std-num", "1116"]);
    const stdout = decode(result.stdout);
    const stderr = decode(result.stderr);
    const envelope = JSON.parse(stderr) as {
      readonly failure: { readonly code: string; readonly parameter?: string; readonly message: string };
      readonly metadata: { readonly cliTransportVersion: string; readonly operation: string };
    };

    expect(result.exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(envelope.failure.code).toBe("invalid_input");
    expect(envelope.failure.parameter).toBe("paraNum");
    expect(envelope.failure.message).toContain('필수 옵션 "--para-num"');
    expect(envelope.metadata.cliTransportVersion).toBe("1");
    expect(envelope.metadata.operation).toBe("get-paragraph");
  });

  test.each(["--query", "--search-word"] as const)("suggests command-local alternative for %s", (option) => {
    const result = runCli(["search-qna", option, "리스"]);
    const envelope = JSON.parse(decode(result.stderr)) as {
      readonly failure: { readonly code: string; readonly message: string };
    };

    expect(result.exitCode).toBe(1);
    expect(decode(result.stdout)).toBe("");
    expect(envelope.failure.code).toBe("invalid_input");
    expect(envelope.failure.message).toContain(`unknown option '${option}'`);
    expect(envelope.failure.message).toContain("--keyword");
  });

  test("does not suggest options from a different command", () => {
    const result = runCli(["get-paragraph", "--query", "리스"]);
    const envelope = JSON.parse(decode(result.stderr)) as {
      readonly failure: { readonly code: string; readonly message: string };
    };

    expect(result.exitCode).toBe(1);
    expect(decode(result.stdout)).toBe("");
    expect(envelope.failure.code).toBe("invalid_input");
    expect(envelope.failure.message).toContain("unknown option '--query'");
    expect(envelope.failure.message).not.toContain("--keyword");
  });

  test("does not suggest command-local options for root-level unknown options", () => {
    const result = runCli(["--query", "리스"]);
    const envelope = JSON.parse(decode(result.stderr)) as {
      readonly failure: { readonly code: string; readonly message: string };
    };

    expect(result.exitCode).toBe(1);
    expect(decode(result.stdout)).toBe("");
    expect(envelope.failure.code).toBe("invalid_input");
    expect(envelope.failure.message).toContain("unknown option '--query'");
    expect(envelope.failure.message).not.toContain("--keyword");
  });

  test("renders unknown commands as JSON failures on stderr", () => {
    const result = runCli(["missing-command"]);
    const envelope = JSON.parse(decode(result.stderr)) as {
      readonly failure: { readonly code: string; readonly message: string };
    };

    expect(result.exitCode).toBe(1);
    expect(decode(result.stdout)).toBe("");
    expect(envelope.failure.code).toBe("invalid_input");
    expect(envelope.failure.message).toContain("unknown command 'missing-command'");
  });

  test.each([
    ["search-standards", ["search-standards", "--limit", "1"], "keyword", "--keyword"],
    ["get-standard-structure", ["get-standard-structure", "--keyword", "리스"], "stdNum", "--std-num"],
    ["get-section", ["get-section", "--std-num", "1116"], "indexDocumentId", "--index-document-id"],
    ["get-paragraph", ["get-paragraph", "--std-num", "1116"], "paraNum", "--para-num"],
    ["search-qna", ["search-qna", "--limit", "5"], "keyword", "--keyword"],
    ["get-qna", ["get-qna", "--keyword", "리스"], "docNumber", "--doc-number"],
  ] as const)("maps %s required-option failures to CLI flags", (_command, argv, parameter, flag) => {
    const result = runCli(argv);
    const envelope = JSON.parse(decode(result.stderr)) as {
      readonly failure: { readonly code: string; readonly parameter?: string; readonly message: string };
    };

    expect(result.exitCode).toBe(1);
    expect(decode(result.stdout)).toBe("");
    expect(envelope.failure.code).toBe("invalid_input");
    expect(envelope.failure.parameter).toBe(parameter);
    expect(envelope.failure.message).toContain(flag);
  });

  test("documents output detail modes for high-volume commands", () => {
    for (const command of ["get-standard-structure", "get-section", "search-qna", "get-qna"]) {
      const result = runCli(["help", command]);
      const stdout = decode(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(decode(result.stderr)).toBe("");
      expect(stdout).toContain("--output <mode>");
      expect(stdout).toContain("summary, structured, raw");
    }
  });

  test("documents common structure and ref lookup examples", () => {
    const structureHelp = runCli(["help", "get-standard-structure"]);
    const structureStdout = decode(structureHelp.stdout);

    expect(structureHelp.exitCode).toBe(0);
    expect(decode(structureHelp.stderr)).toBe("");
    expect(structureStdout).toContain("kasb get-standard-structure --std-num 1116 --keyword 리스 --output summary");
    expect(structureStdout).toContain("kasb get-standard-structure --std-num 1115 --keyword 수행의무 --output summary");
    expect(structureStdout).toContain("--keyword는 get-section --ref로 이어질 후보 섹션을 좁힐 때 사용하세요.");

    const sectionHelp = runCli(["help", "get-section"]);
    const sectionStdout = decode(sectionHelp.stdout);

    expect(sectionHelp.exitCode).toBe(0);
    expect(decode(sectionHelp.stderr)).toBe("");
    expect(sectionStdout).toContain("kasb get-section --std-num 1116 --ref 3~4 --output summary");
    expect(sectionStdout).toContain("kasb get-section --std-num 1116 --ref 9~17 --output summary");
    expect(sectionStdout).toContain("kasb get-section --std-num 1019 --ref 153~158 --output summary");
    expect(sectionStdout).toContain("kasb get-section --std-num 1115 --ref 22~30 --output summary");

    const paragraphHelp = runCli(["help", "get-paragraph"]);
    const paragraphStdout = decode(paragraphHelp.stdout);

    expect(paragraphHelp.exitCode).toBe(0);
    expect(decode(paragraphHelp.stderr)).toBe("");
    expect(paragraphStdout).toContain("kasb get-paragraph --std-num 1116 --para-num 9");
    expect(paragraphStdout).toContain("문단 범위(예: 9~17, 22~30)는 --para-num이 아니라 get-section --ref로 조회하세요.");
  });

  test("adds a structure lookup next action when get-section lacks a locator", () => {
    const result = runCli(["get-section", "--std-num", "1019"]);
    const envelope = JSON.parse(decode(result.stderr)) as {
      readonly failure: {
        readonly code: string;
        readonly parameter?: string;
        readonly message: string;
        readonly nextAction?: { readonly operation: string; readonly command: string; readonly reason: string; readonly input: { readonly stdNum: string } };
      };
    };

    expect(result.exitCode).toBe(1);
    expect(decode(result.stdout)).toBe("");
    expect(envelope.failure.code).toBe("invalid_input");
    expect(envelope.failure.parameter).toBe("indexDocumentId");
    expect(envelope.failure.message).toContain("--index-document-id");
    expect(envelope.failure.nextAction).toEqual({
      operation: "get-standard-structure",
      input: { stdNum: "1019" },
      command: "kasb get-standard-structure --std-num 1019 --output summary",
      reason: expect.stringContaining("get-standard-structure"),
    });
  });

  test("preserves the used --limit alias on search-qna row validation failures", () => {
    const result = runCli(["search-qna", "--keyword", "리스", "--limit", "999"]);
    const envelope = JSON.parse(decode(result.stderr)) as {
      readonly failure: {
        readonly code: string;
        readonly parameter?: string;
        readonly cliOption?: string;
        readonly message: string;
        readonly nextAction?: { readonly operation: string; readonly command: string; readonly reason: string; readonly input: { readonly keyword: string; readonly rows: number } };
      };
    };

    expect(result.exitCode).toBe(1);
    expect(decode(result.stdout)).toBe("");
    expect(envelope.failure.code).toBe("invalid_input");
    expect(envelope.failure.parameter).toBe("rows");
    expect(envelope.failure.cliOption).toBe("--limit");
    expect(envelope.failure.message).toContain('옵션 "--limit"');
    expect(envelope.failure.nextAction).toEqual({
      operation: "search-qna",
      input: { keyword: "리스", rows: 50 },
      command: "kasb search-qna --keyword '리스' --limit 50 --output summary",
      reason: expect.stringContaining("1~50"),
    });
  });

  test.each([
    ["search-standards", ["search-standards", "--keyword", "리스", "--limit", "1.5"], "1.5"],
    ["search-qna page", ["search-qna", "--keyword", "리스", "--page", "abc"], "abc"],
    ["search-qna rows", ["search-qna", "--keyword", "리스", "--rows", "-1"], "-1"],
  ] as const)("rejects non-integer CLI flags for %s", (_label, argv, value) => {
    const result = runCli(argv);
    const envelope = JSON.parse(decode(result.stderr)) as {
      readonly failure: { readonly code: string; readonly message: string };
    };

    expect(result.exitCode).toBe(1);
    expect(decode(result.stdout)).toBe("");
    expect(envelope.failure.code).toBe("invalid_input");
    expect(envelope.failure.message).toContain(value);
  });
});
