import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import {
  executeConformanceRunner,
  judgeKnownBadControls,
  readConformanceManifest,
  readKnownBadManifest,
} from "./judge.ts";

const repoRoot = join(import.meta.dir, "..");
const manifest = readConformanceManifest(repoRoot);

describe("conformer-neutral conformance judge", () => {
  test("rejects every declared adversarial outcome", () => {
    expect(
      judgeKnownBadControls(repoRoot, manifest, readKnownBadManifest(repoRoot)),
    ).toEqual([]);
  });

  test("rejects malformed runner stdout", async () => {
    await expect(executeConformanceRunner(repoRoot, {
      name: "malformed-control",
      command: [process.execPath, "-e", "process.stdout.write('not-json')"],
      cwd: repoRoot,
    }, manifest.cases[0]!)).rejects.toThrow("returned invalid JSON");
  });

  test("rejects unexpected runner stderr even after a successful protocol exit", async () => {
    const script = [
      "process.stderr.write('diagnostic')",
      "process.stdout.write(JSON.stringify({ok:true,value:{}}))",
    ].join(";");
    await expect(executeConformanceRunner(repoRoot, {
      name: "stderr-control",
      command: [process.execPath, "-e", script],
      cwd: repoRoot,
    }, manifest.cases[0]!)).rejects.toThrow("wrote unexpected stderr");
  });
});
