import { chmod, copyFile, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const rustTarget = process.argv[2];
const profile = process.argv[3] ?? "release";
if (!rustTarget) throw new Error("Usage: node scripts/assemble-native-package.mjs <rust-target> [profile]");

const manifest = JSON.parse(await readFile(resolve(repositoryRoot, "native-targets.json"), "utf8"));
const target = manifest.targets.find((candidate) => candidate.rustTarget === rustTarget);
if (!target) throw new Error(`Unknown native target: ${rustTarget}`);

const libraryExtension = target.npmPlatform === "win32"
  ? "dll"
  : target.npmPlatform === "darwin" ? "dylib" : "so";
const libraryPrefix = target.npmPlatform === "win32" ? "" : "lib";
const targetDirectory = resolve(repositoryRoot, "target", rustTarget, profile);
const addonSource = resolve(targetDirectory, `${libraryPrefix}kasb_node.${libraryExtension}`);
const cliSource = resolve(targetDirectory, target.cliFile);
const packageDirectory = resolve(repositoryRoot, manifest.nativePackageRoot, target.packageDirectory);
const addonDestination = resolve(packageDirectory, target.addonFile);
const cliDestination = resolve(packageDirectory, target.cliFile);

await requireFile(addonSource);
await requireFile(cliSource);
await copyFile(addonSource, addonDestination);
await copyFile(cliSource, cliDestination);
if (target.npmPlatform !== "win32") await chmod(cliDestination, 0o755);

console.log(JSON.stringify({
  rustTarget,
  addon: target.addonFile,
  addonSha256: await sha256(addonDestination),
  cli: target.cliFile,
  cliSha256: await sha256(cliDestination),
}));

async function requireFile(path) {
  const metadata = await stat(path);
  if (!metadata.isFile()) throw new Error(`Expected a built file at ${path}`);
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}
