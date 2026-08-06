import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const runKasbScript = async (args: readonly string[]) => {
  const subprocess = Bun.spawn([join(import.meta.dir, "kasb.ts"), ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
    subprocess.exited,
  ]);

  return { exitCode, stderr, stdout };
};

describe("scripts/kasb.ts", () => {
  test("runs the top-level kasb CLI", async () => {
    const result = await runKasbScript(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage: kasb [options] [command]");
    expect(result.stdout).toContain("search-standards");
    expect(result.stdout).toContain("search-qna");
  });

  test("forwards subcommands to the kasb CLI", async () => {
    const result = await runKasbScript(["get-paragraph", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage: kasb get-paragraph [options]");
    expect(result.stdout).toContain("--para-num <text>");
  });
});
