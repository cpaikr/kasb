import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = await mkdtemp(join(tmpdir(), "kasb-declarations-"));

try {
  const result = spawnSync("bun", [
    "x",
    "tsc",
    "--project",
    "packages/node/tsconfig.declarations.json",
    "--emitDeclarationOnly",
    "--outDir",
    outputDirectory,
  ], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`declaration generation failed\n${result.stdout}${result.stderr}`);
  }

  const [expected, actual] = await Promise.all([
    readFile(join(repositoryRoot, "contracts/node/toolset-v1.d.ts"), "utf8"),
    readFile(join(outputDirectory, "toolset.d.ts"), "utf8"),
  ]);
  if (actual !== expected) {
    throw new Error(
      "The emitted ./toolset declaration differs from contracts/node/toolset-v1.d.ts. Review the public compatibility change and update the snapshot explicitly.",
    );
  }
  console.log("KASB v1 toolset declarations match the frozen compatibility snapshot");
} finally {
  await rm(outputDirectory, { recursive: true, force: true });
}
