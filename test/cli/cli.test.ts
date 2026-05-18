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
  });

  test("prints help subcommand without a JSON failure", () => {
    const result = runCli(["help", "search-standards"]);
    const stdout = decode(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(decode(result.stderr)).toBe("");
    expect(stdout).toContain("Usage: kasb search-standards [options]");
    expect(stdout).toContain("--limit <number>");
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
