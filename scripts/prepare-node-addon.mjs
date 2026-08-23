import { execFileSync } from "node:child_process";
import { copyFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runtimeTarget, selectNativeTarget } from "../packages/node/src/runtime-target.js";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifest = JSON.parse(await readFile(resolve(repositoryRoot, "native-targets.json"), "utf8"));
const target = selectNativeTarget(
  manifest.targets,
  runtimeTarget(),
  manifest.minimumGlibcVersion,
);
if (!target) throw new Error("The current host is not in the KASB Node conformance matrix.");

const judge = process.argv.includes("--judge");
const cargoArguments = [
  "build",
  "--locked",
  "-p",
  "kasb-node",
  ...(judge ? ["--features", "feasibility-judge"] : []),
  "--lib",
];
execFileSync("cargo", cargoArguments, {
  cwd: repositoryRoot,
  stdio: "inherit",
});
const metadata = JSON.parse(execFileSync("cargo", ["metadata", "--no-deps", "--format-version", "1"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}));
const library = process.platform === "win32"
  ? "kasb_node.dll"
  : process.platform === "darwin" ? "libkasb_node.dylib" : "libkasb_node.so";
await copyFile(
  resolve(metadata.target_directory, "debug", library),
  resolve(repositoryRoot, manifest.nativePackageRoot, target.packageDirectory, target.addonFile),
);
execFileSync("bun", ["run", "--cwd", "packages/node", "build"], {
  cwd: repositoryRoot,
  stdio: "inherit",
});
console.log(`prepared ${judge ? "judge" : "production"} Node addon for ${target.rustTarget}`);
