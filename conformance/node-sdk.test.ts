import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import {
  judgeConformanceCase,
  readConformanceManifest,
  type ConformanceCase,
} from "./judge.ts";

const repositoryRoot = join(import.meta.dir, "..");
const manifest = readConformanceManifest(repositoryRoot);
const runner = {
  name: "rust-backed-node-sdk",
  command: ["node", "conformance/node-runner.mjs"],
  cwd: repositoryRoot,
  timeoutMs: 30_000,
} as const;

describe("Rust-backed public Node SDK conformance runner", () => {
  for (const testCase of manifest.cases) {
    test(`${testCase.id} matches through the public Node SDK process`, async () => {
      expect(await judgeConformanceCase(repositoryRoot, manifest, runner, testCase)).toBeUndefined();
    }, 35_000);
  }

  test("fails closed when the public facade requests an undeclared route", async () => {
    const testCase: ConformanceCase = {
      id: "node-undeclared-route-control",
      operation: "get-paragraph",
      input: { stdNum: "1116", paraNum: "23" },
      routes: [],
      expected: "conformance/v1/expected/get-paragraph-success.json",
    };
    expect(await judgeConformanceCase(repositoryRoot, manifest, runner, testCase)).toMatchObject({
      kind: "missing-key",
      path: "$.error",
      actual: { code: "internal_failure" },
    });
  });

  test("cancels an in-flight public facade request after transport starts", () => {
    const result = spawnSync("node", ["conformance/node-runner.mjs"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      input: JSON.stringify({
        protocolVersion: 1,
        operation: "get-paragraph",
        input: { stdNum: "1116", paraNum: "23" },
        abortAfterStart: true,
        routes: [{
          requestUrl: "https://db.kasb.or.kr/api/paragraphs/content/1116/23",
          payload: {},
          waitForCancellation: true,
        }],
      }),
      timeout: 10_000,
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      ok: false,
      error: {
        code: "aborted",
        message: "KASB operation was aborted: get-paragraph",
        recoverable: false,
        retryable: true,
        operationName: "get-paragraph",
      },
    });
  });

  test("emits one sanitized contained-panic diagnostic without changing the public failure", () => {
    const result = spawnSync("node", ["conformance/node-runner.mjs"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      input: JSON.stringify({
        protocolVersion: 1,
        operation: "get-paragraph",
        input: { stdNum: "1116", paraNum: "23" },
        captureNativeDiagnostics: true,
        routes: [{
          requestUrl: "https://db.kasb.or.kr/api/paragraphs/content/1116/23",
          payload: {},
          panic: true,
        }],
      }),
      timeout: 10_000,
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("deliberate configured fixture panic");
    expect(JSON.parse(result.stdout)).toEqual({
      ok: false,
      error: {
        code: "internal_failure",
        message: "The native KASB binding failed internally.",
        retryable: false,
      },
      diagnostics: [{ code: "binding_panic" }],
    });
  });
});
