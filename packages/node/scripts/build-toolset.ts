import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { BunPlugin } from "bun";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");
const outputDirectory = resolve(packageRoot, "dist");
const replacement = resolve(packageRoot, "src/default-operations.ts");
const appImport = /^\.\/app\/(?:search-standards|get-standard-structure|get-section|get-paragraph|search-qna|get-qna)\.ts$/;

const rustOperations: BunPlugin = {
  name: "kasb-rust-operations",
  setup(build) {
    build.onResolve({ filter: appImport }, () => ({ path: replacement }));
    build.onResolve({ filter: /^\.\/native\.js$/ }, ({ path }) => ({ path, external: true }));
    build.onResolve({ filter: /^\.\/toolset\.js$/ }, ({ path }) => ({ path, external: true }));
  },
};

await mkdir(outputDirectory, { recursive: true });
const result = await Bun.build({
  entrypoints: [resolve(repositoryRoot, "packages/kasb-ts/src/toolset.ts")],
  outdir: outputDirectory,
  naming: "toolset.js",
  target: "node",
  format: "esm",
  minify: false,
  sourcemap: "none",
  plugins: [rustOperations],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exitCode = 1;
} else {
  await copyFile(
    resolve(repositoryRoot, "contracts/node/toolset-v1.d.ts"),
    resolve(outputDirectory, "toolset.d.ts"),
  );
}
