import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import {
  canonicalizeConformanceOutcome,
  executeConformanceCase,
  findConformanceDifference,
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
      const actual = readConformanceJson(repoRoot, knownBadCase.actual);
      const difference = findConformanceDifference(expected, actual);
      expect(difference?.kind).toBe(knownBadCase.expectedDifference);
      expect(difference?.path).toBe(knownBadCase.expectedPath);
    });
  }
});
