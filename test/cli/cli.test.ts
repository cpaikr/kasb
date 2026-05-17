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
    expect(stdout).toContain("search-qnas [options]");
    expect(stdout).toContain("get-qna [options]");
  });

  test("prints command help when no command options are passed", () => {
    const result = runCli(["get-paragraph"]);
    const stdout = decode(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(decode(result.stderr)).toBe("");
    expect(stdout).toContain("Usage: kasb get-paragraph [options]");
    expect(stdout).toContain("--std-num <text>");
    expect(stdout).toContain("--para-num <text>");
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
});
