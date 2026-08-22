import { chmod, copyFile, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { assertTargetAlignment } from "./target-alignment.mjs";

const packageRoot = resolve(import.meta.dirname, "..");
const source = resolve(packageRoot, "src");
const dist = resolve(packageRoot, "dist");
const repositoryRoot = resolve(packageRoot, "../..");
const packageJson = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));
const targetManifest = JSON.parse(
  await readFile(resolve(repositoryRoot, "native-targets.json"), "utf8")
);

assertTargetAlignment(targetManifest, packageJson);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const entry of await readdir(source, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  await copyFile(resolve(source, entry.name), resolve(dist, entry.name));
}
await copyFile(
  resolve(repositoryRoot, "native-targets.json"),
  resolve(dist, "native-targets.json")
);
await chmod(resolve(dist, "cli.js"), 0o755);
