import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { BunPlugin } from "bun";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(packageRoot, "dist");

const externalNativeBinding: BunPlugin = {
  name: "kasb-external-native-binding",
  setup(build) {
    build.onResolve({ filter: /^\.\/native\.js$/ }, ({ path }) => ({ path, external: true }));
  },
};

await mkdir(outputDirectory, { recursive: true });
const result = await Bun.build({
  entrypoints: [resolve(packageRoot, "src/toolset.ts")],
  outdir: outputDirectory,
  naming: "toolset.js",
  target: "node",
  format: "esm",
  minify: false,
  sourcemap: "none",
  plugins: [externalNativeBinding],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exitCode = 1;
} else {
  await copyFile(
    resolve(packageRoot, "../../contracts/node/toolset-v1.d.ts"),
    resolve(outputDirectory, "toolset.d.ts"),
  );
}
