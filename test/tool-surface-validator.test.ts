import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");
const validatorPath = join(
  repoRoot,
  ".agents",
  "skills",
  "tool-surface-spec",
  "scripts",
  "validate-tool-surface.mjs",
);
const tempDirs: string[] = [];

const decode = (value: Uint8Array<ArrayBufferLike>) => new TextDecoder().decode(value);

const createFixturePackage = (unknownOperationError: Record<string, unknown>): string => {
  const root = mkdtempSync(join(tmpdir(), "tool-surface-validator-"));
  tempDirs.push(root);
  mkdirSync(join(root, "dist"));

  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "tool-surface-validator-fixture",
      type: "module",
      bin: { fixture: "dist/cli.js" },
      exports: { "./toolset": { import: "./dist/toolset.js" } },
    }),
  );
  writeFileSync(join(root, "dist", "cli.js"), "#!/usr/bin/env node\n");
  writeFileSync(
    join(root, "dist", "toolset.js"),
    `
const operation = {
  name: "search-items",
  label: "Search items",
  description: "Search deterministic fixture items.",
};
const spec = {
  ...operation,
  inputJsonSchema: { type: "object" },
  resultJsonSchema: { type: "object" },
  requiredInputKeys: [],
  examples: [{}],
  limitations: [],
  resultSummary: "Fixture results.",
};
export const createFixtureToolset = () => ({
  id: "fixture",
  label: "Fixture toolset",
  description: "Deterministic fixture operations.",
  help: () => ({ id: "fixture", operations: [operation] }),
  listOperations: () => [operation],
  getCommandHelp: (name) => name === operation.name ? spec : undefined,
  validateInput: (name, input) => name === operation.name
    ? { ok: true, input }
    : { ok: false, error: ${JSON.stringify(unknownOperationError)} },
  execute: async () => ({}),
  serializeError: (error) => ({ name: error.name, message: error.message }),
});
`,
  );

  return root;
};

const runValidator = (root: string) =>
  Bun.spawnSync({
    cmd: ["node", validatorPath, root],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { force: true, recursive: true });
});

describe("tool-surface conformance validator", () => {
  test("accepts unknown-operation recovery metadata without retryable", () => {
    const result = runValidator(createFixturePackage({
      code: "invalid_request",
      message: "Unknown operation.",
      recoverable: true,
      recoveryAction: { kind: "inspect_tool_help" },
    }));

    expect(result.exitCode).toBe(0);
    expect(decode(result.stdout)).toContain("Result: PASS");
    expect(decode(result.stderr)).toBe("");
  });

  test("rejects the stale retryable-only unknown-operation shape", () => {
    const result = runValidator(createFixturePackage({
      code: "invalid_request",
      message: "Unknown operation.",
      retryable: false,
    }));
    const stdout = decode(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(stdout).toContain("unknown operation validation error is recoverable");
    expect(stdout).toContain("unknown operation validation error uses inspect_tool_help recovery action");
    expect(stdout).toContain("Result: FAIL (2 failures)");
    expect(decode(result.stderr)).toBe("");
  });
});
