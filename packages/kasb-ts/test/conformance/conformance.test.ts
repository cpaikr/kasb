import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import {
  canonicalizeConformanceOutcome,
  conformanceRequestUrl,
  executeConformanceCase,
  findConformanceDifference,
  installFixtureFetch,
  judgeConformanceCase,
  judgeKnownBadControls,
  readConformanceJson,
  readConformanceManifest,
  readKnownBadManifest,
  type ConformanceCase,
} from "./harness.ts";

const repoRoot = join(import.meta.dir, "../../../..");
const manifest = readConformanceManifest(repoRoot);

const knownBad = readKnownBadManifest(repoRoot);

describe("language-neutral KASB v1 conformance cases", () => {
  test("resolves fixture routes from Request, URL, and string fetch inputs", () => {
    const url = "https://db.kasb.or.kr/api/paragraphs/content/1116/23?keyword=lease";
    for (const input of [url, new URL(url), new Request(url)]) {
      const resolved = conformanceRequestUrl(input);
      expect(`${resolved.pathname}${resolved.search}`).toBe(
        "/api/paragraphs/content/1116/23?keyword=lease",
      );
    }
  });

  test("rejects an undeclared origin even when path and query match", async () => {
    const fixtureFetch = installFixtureFetch(repoRoot, [{
      requestUrl: "https://db.kasb.or.kr/api/paragraphs/content/1116/23",
      fixture: "fixtures/kasb/paragraph-1116-23.json",
    }]);
    try {
      await expect(fetch("https://other.example/api/paragraphs/content/1116/23")).rejects.toThrow(
        "Conformance case made an undeclared source request",
      );
      expect(fixtureFetch.undeclaredRequests).toEqual([
        "https://other.example/api/paragraphs/content/1116/23",
      ]);
    } finally {
      fixtureFetch.restore();
    }
  });

  test("judges the serialized JSON boundary instead of live JavaScript values", () => {
    expect(canonicalizeConformanceOutcome({
      array: [undefined],
      nonFinite: Number.NaN,
      omitted: undefined,
      present: "value",
    }, manifest)).toEqual({
      array: [null],
      nonFinite: null,
      present: "value",
    });
  });

  test("inventory has at least one success and one typed invalid-input failure for every v1 operation", () => {
    const byOperation = Map.groupBy(manifest.cases, (testCase) => testCase.operation);
    expect(byOperation.size).toBe(6);
    for (const cases of byOperation.values()) {
      expect(cases.some((testCase) => testCase.id.endsWith("-success"))).toBe(true);
      expect(cases.some((testCase) => testCase.id.endsWith("-invalid-input"))).toBe(true);
    }
    expect(manifest.cases.map((testCase) => testCase.id)).toContain("get-paragraph-source-changed");
  });

  for (const testCase of manifest.cases) {
    test(`${testCase.id} matches the committed expectation through the TypeScript process`, async () => {
      const actual = canonicalizeConformanceOutcome(
        await executeConformanceCase(repoRoot, testCase),
        manifest,
      );
      const expected = readConformanceJson(repoRoot, testCase.expected);
      expect(findConformanceDifference(expected, actual)).toBeUndefined();
      expect((actual as { readonly ok: boolean }).ok).toBe(
        (expected as { readonly ok: boolean }).ok,
      );
    });
  }

  test("the TypeScript runner process fails closed on an undeclared request", async () => {
    const testCase: ConformanceCase = {
      id: "undeclared-route-control",
      operation: "get-paragraph",
      input: { stdNum: "1116", paraNum: "23" },
      routes: [],
      expected: "conformance/v1/expected/get-paragraph-success.json",
    };
    await expect(executeConformanceCase(repoRoot, testCase)).rejects.toThrow(
      "made undeclared source requests",
    );
  });

  test("the runner requires exact request URL text instead of URL equivalence", async () => {
    const testCase: ConformanceCase = {
      id: "textually-different-route-control",
      operation: "get-paragraph",
      input: { stdNum: "1116", paraNum: "23" },
      routes: [{
        requestUrl: "https://db.kasb.or.kr:443/api/paragraphs/content/1116/23",
        fixture: "fixtures/kasb/paragraph-1116-23.json",
      }],
      expected: "conformance/v1/expected/get-paragraph-success.json",
    };
    await expect(executeConformanceCase(repoRoot, testCase)).rejects.toThrow(
      "made undeclared source requests",
    );
  });

  test("the runner rejects an unknown operation as a protocol error", async () => {
    const testCase = {
      id: "unknown-operation-control",
      operation: "not-a-kasb-operation",
      input: {},
      routes: [],
      expected: "conformance/v1/expected/get-paragraph-success.json",
    } as unknown as ConformanceCase;
    await expect(executeConformanceCase(repoRoot, testCase)).rejects.toThrow(
      "does not support operation not-a-kasb-operation for unknown-operation-control",
    );
  });
});

describe("public Rust SDK conformance runner", () => {
  const rustRunner = {
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
    cwd: repoRoot,
  } as const;

  for (const testCase of manifest.cases.filter(({ operation }) => operation === "get-paragraph")) {
    test(`${testCase.id} matches through the public Rust SDK process`, async () => {
      expect(await judgeConformanceCase(repoRoot, manifest, rustRunner, testCase)).toBeUndefined();
    }, 30_000);
  }
});

describe("conformance judge negative controls", () => {
  test("covers wrong success, wrong typed failure, serialization mismatch, and source metadata corruption", () => {
    expect(knownBad.cases.map((testCase) => testCase.id)).toEqual([
      "wrong-success-value",
      "wrong-typed-failure",
      "serialization-mismatch",
      "source-metadata-corruption",
    ]);
    expect(judgeKnownBadControls(repoRoot, manifest, knownBad)).toEqual([]);
  });

  for (const knownBadCase of knownBad.cases) {
    test(`rejects ${knownBadCase.id}`, () => {
      const baseline = manifest.cases.find((testCase) => testCase.id === knownBadCase.baselineCase);
      if (baseline === undefined) throw new Error(`Unknown baseline case: ${knownBadCase.baselineCase}`);
      const expected = readConformanceJson(repoRoot, baseline.expected);
      const actual = canonicalizeConformanceOutcome(
        readConformanceJson(repoRoot, knownBadCase.actual),
        manifest,
      );
      const difference = findConformanceDifference(expected, actual);
      expect(difference?.kind).toBe(knownBadCase.expectedDifference);
      expect(difference?.path).toBe(knownBadCase.expectedPath);
    });
  }
});
