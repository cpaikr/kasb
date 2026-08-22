import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  canonicalizeConformanceOutcome,
  executeConformanceCase,
  readConformanceManifest,
} from "../test/conformance/harness.ts";

const repoRoot = join(import.meta.dir, "../../..");
if (process.env.KASB_REVIEWED_BASELINE_UPDATE !== "1") {
  throw new Error(
    "Conformance expectations are reviewed evidence. Set KASB_REVIEWED_BASELINE_UPDATE=1 only during an explicitly reviewed baseline update.",
  );
}
const manifest = readConformanceManifest(repoRoot);

for (const testCase of manifest.cases) {
  const outputPath = join(repoRoot, testCase.expected);
  const outcome = canonicalizeConformanceOutcome(
    await executeConformanceCase(repoRoot, testCase),
    manifest,
  );
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(outcome, null, 2)}\n`);
}

const readCaptured = (path: string): Record<string, any> =>
  JSON.parse(readFileSync(join(repoRoot, path), "utf8")) as Record<string, any>;

const writeKnownBad = (name: string, value: unknown): void => {
  const outputPath = join(repoRoot, "conformance/v1/known-bad", `${name}.json`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`);
};

const wrongSuccess = structuredClone(
  readCaptured("conformance/v1/expected/get-paragraph-success.json"),
);
wrongSuccess.value.result.paragraph.uniqueKey = "1116-24";
writeKnownBad("wrong-success-value", wrongSuccess);

const wrongFailure = structuredClone(
  readCaptured("conformance/v1/expected/get-paragraph-invalid-input.json"),
);
wrongFailure.error.code = "not_found";
writeKnownBad("wrong-typed-failure", wrongFailure);

const serializationMismatch = structuredClone(
  readCaptured("conformance/v1/expected/get-paragraph-success.json"),
);
serializationMismatch.value.result.request.stdNum = 1116;
writeKnownBad("serialization-mismatch", serializationMismatch);

const sourceMetadataCorruption = structuredClone(
  readCaptured("conformance/v1/expected/get-paragraph-success.json"),
);
sourceMetadataCorruption.value.metadata.source.endpoint =
  "https://db.kasb.or.kr/api/paragraphs/content/1116/24";
writeKnownBad("source-metadata-corruption", sourceMetadataCorruption);
