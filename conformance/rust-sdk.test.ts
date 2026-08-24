import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import {
  canonicalizeConformanceOutcome,
  judgeConformanceCase,
  readConformanceManifest,
} from "./judge.ts";

const repositoryRoot = join(import.meta.dir, "..");
const manifest = readConformanceManifest(repositoryRoot);
const runner = {
  name: "rust-sdk",
  command: [
    "cargo",
    "run",
    "--quiet",
    "--locked",
    "-p",
    "kasb",
    "--example",
    "conformance_runner",
  ],
  cwd: repositoryRoot,
} as const;

describe("public Rust SDK conformance runner", () => {
  test("covers success and typed invalid input for every approved operation", () => {
    const byOperation = Map.groupBy(manifest.cases, (testCase) => testCase.operation);
    expect(byOperation.size).toBe(6);
    for (const cases of byOperation.values()) {
      expect(cases.some((testCase) => testCase.id.endsWith("-success"))).toBe(true);
      expect(cases.some((testCase) => testCase.id.endsWith("-invalid-input"))).toBe(true);
    }
  });

  test("keeps the judge on the serialized JSON boundary", () => {
    expect(canonicalizeConformanceOutcome({ array: [undefined], omitted: undefined }, manifest)).toEqual({
      array: [null],
    });
  });

  for (const testCase of manifest.cases) {
    test(`${testCase.id} matches through the public Rust SDK process`, async () => {
      expect(await judgeConformanceCase(repositoryRoot, manifest, runner, testCase)).toBeUndefined();
    }, 30_000);
  }
});
