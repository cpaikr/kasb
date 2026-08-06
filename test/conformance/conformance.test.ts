import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import {
  canonicalizeConformanceOutcome,
  conformanceRequestUrl,
  executeConformanceCase,
  findConformanceDifference,
  installFixtureFetch,
  readConformanceJson,
  readConformanceManifest,
  type DifferenceKind,
} from "./harness.ts";

const repoRoot = join(import.meta.dir, "../..");
const manifest = readConformanceManifest(repoRoot);

type KnownBadManifest = {
  readonly schemaVersion: 1;
  readonly cases: readonly {
    readonly id: string;
    readonly baselineCase: string;
    readonly actual: string;
    readonly expectedDifference: DifferenceKind;
    readonly expectedPath: string;
  }[];
};

const knownBad = readConformanceJson(repoRoot, "conformance/v1/known-bad.json") as KnownBadManifest;

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

  test("inventory has one success and one typed failure for every v1 operation", () => {
    const byOperation = Map.groupBy(manifest.cases, (testCase) => testCase.operation);
    expect(byOperation.size).toBe(6);
    for (const cases of byOperation.values()) {
      expect(cases).toHaveLength(2);
      expect(cases.some((testCase) => testCase.id.endsWith("-success"))).toBe(true);
      expect(cases.some((testCase) => testCase.id.endsWith("-invalid-input"))).toBe(true);
    }
  });

  for (const testCase of manifest.cases) {
    test(`${testCase.id} matches the TypeScript baseline`, async () => {
      const actual = canonicalizeConformanceOutcome(
        await executeConformanceCase(repoRoot, testCase),
        manifest,
      );
      const expected = readConformanceJson(repoRoot, testCase.expected);
      expect(findConformanceDifference(expected, actual)).toBeUndefined();
      expect((actual as { readonly ok: boolean }).ok).toBe(testCase.id.endsWith("-success"));
    });
  }
});

describe("conformance judge negative controls", () => {
  test("covers wrong success, wrong typed failure, and serialization mismatch", () => {
    expect(knownBad.cases.map((testCase) => testCase.id)).toEqual([
      "wrong-success-value",
      "wrong-typed-failure",
      "serialization-mismatch",
    ]);
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
