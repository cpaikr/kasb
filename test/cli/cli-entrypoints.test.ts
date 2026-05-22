import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");
const nodeRuntime = process.env.KASB_NODE_RUNTIME ?? "node";

const decode = (value: Uint8Array<ArrayBufferLike>) => new TextDecoder().decode(value);

const runEntrypoint = (runtime: string, entrypoint: string, argv: readonly string[]) =>
  Bun.spawnSync({
    cmd: [runtime, entrypoint, ...argv],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });

const runExecutable = (entrypoint: string, argv: readonly string[]) =>
  Bun.spawnSync({
    cmd: [entrypoint, ...argv],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });

describe("CLI entrypoints", () => {
  let buildDir: string;
  let builtEntrypoint: string;

  beforeAll(() => {
    buildDir = mkdtempSync(join(tmpdir(), "kasb-cli-"));
    builtEntrypoint = join(buildDir, "cli.js");

    const result = Bun.spawnSync({
      cmd: [process.execPath, "run", "scripts/build-cli.ts", "--outfile", builtEntrypoint],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });

    if (result.exitCode !== 0) {
      throw new Error(`Failed to build CLI smoke-test bundle.\nstdout:\n${decode(result.stdout)}\nstderr:\n${decode(result.stderr)}`);
    }
  });

  afterAll(() => {
    rmSync(buildDir, { force: true, recursive: true });
  });

  test.each([
    ["source via Bun", process.execPath, "src/cli.ts"],
    ["bundled via Node", nodeRuntime, () => builtEntrypoint],
    ["bundled via Bun", process.execPath, () => builtEntrypoint],
  ] as const)("%s root help exposes public commands", (_label, runtime, entrypoint) => {
    const result = runEntrypoint(
      runtime,
      typeof entrypoint === "function" ? entrypoint() : entrypoint,
      ["--help"],
    );
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

  test("bundled CLI is executable through its Node shebang", () => {
    const result = runExecutable(builtEntrypoint, ["--help"]);

    expect(result.exitCode).toBe(0);
    expect(decode(result.stderr)).toBe("");
    expect(decode(result.stdout)).toContain("Usage: kasb [options] [command]");
  });

  test("bundled CLI renders unknown commands as JSON failures on stdout", () => {
    const result = runEntrypoint(nodeRuntime, builtEntrypoint, ["missing-command"]);
    const envelope = JSON.parse(decode(result.stdout)) as {
      readonly failure: { readonly code: string; readonly message: string };
    };

    expect(result.exitCode).toBe(1);
    expect(decode(result.stderr)).toBe("");
    expect(envelope.failure.code).toBe("invalid_input");
    expect(envelope.failure.message).toContain("unknown command 'missing-command'");
  });

  test("bundled CLI validates command input through Node", () => {
    const result = runEntrypoint(nodeRuntime, builtEntrypoint, ["get-section", "--std-num", "1116"]);
    const envelope = JSON.parse(decode(result.stdout)) as {
      readonly failure: { readonly code: string; readonly parameter?: string; readonly message: string };
      readonly metadata: { readonly operation: string };
    };

    expect(result.exitCode).toBe(1);
    expect(decode(result.stderr)).toBe("");
    expect(envelope.failure.code).toBe("invalid_input");
    expect(envelope.failure.parameter).toBe("indexDocumentId");
    expect(envelope.failure.message).toContain('필수 옵션 "--index-document-id"');
    expect(envelope.metadata.operation).toBe("get-section");
  });

  test.each([
    ["search-standards", "--keyword <text>"],
    ["get-standard-structure", "--std-num <text>"],
    ["get-section", "--index-document-id <text>"],
    ["get-paragraph", "--para-num <text>"],
    ["search-qna", "--rows <number>"],
    ["get-qna", "--doc-number <text>"],
  ] as const)("bundled CLI accepts documented %s command", (command, expectedFlag) => {
    const result = runEntrypoint(nodeRuntime, builtEntrypoint, [command, "--help"]);
    const stdout = decode(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(decode(result.stderr)).toBe("");
    expect(stdout).toContain(`Usage: kasb ${command} [options]`);
    expect(stdout).toContain(expectedFlag);
  });
});
