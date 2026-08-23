import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const checkOnly = process.argv.includes("--check");
const manifest = JSON.parse(await readFile(resolve(repositoryRoot, "native-targets.json"), "utf8"));
const rootPackagePath = resolve(repositoryRoot, manifest.rootPackage, "package.json");
const rootPackage = JSON.parse(await readFile(rootPackagePath, "utf8"));
const license = await readFile(resolve(repositoryRoot, "LICENSE.md"), "utf8");
const notices = await readFile(resolve(repositoryRoot, "THIRD_PARTY_LICENSES.html"), "utf8");
const outputs = new Map();

rootPackage.optionalDependencies = Object.fromEntries(
  manifest.targets.map((target) => [target.packageName, rootPackage.version]),
);
outputs.set(rootPackagePath, `${JSON.stringify(rootPackage, null, 2)}\n`);

for (const target of manifest.targets) {
  const directory = resolve(repositoryRoot, manifest.nativePackageRoot, target.packageDirectory);
  const nativePackage = {
    name: target.packageName,
    version: rootPackage.version,
    description: `Native KASB Node addon and Rust CLI for ${target.npmPlatform}-${target.npmArch}.`,
    main: target.addonFile,
    files: [target.addonFile, target.cliFile, "LICENSE.md", "THIRD_PARTY_LICENSES.html"],
    os: [target.npmPlatform],
    cpu: [target.npmArch],
    ...(target.libc ? { libc: [target.libc] } : {}),
    engines: { node: `>=${manifest.minimumNodeVersion}` },
    repository: {
      type: "git",
      url: "git+https://github.com/cpaikr/kasb.git",
      directory: `${manifest.nativePackageRoot}/${target.packageDirectory}`,
    },
    license: rootPackage.license ?? "Elastic-2.0",
    publishConfig: { access: "public" },
  };
  outputs.set(resolve(directory, "package.json"), `${JSON.stringify(nativePackage, null, 2)}\n`);
  outputs.set(
    resolve(directory, "README.md"),
    `# KASB for ${target.rustTarget}\n\nThis generated artifact contains the ${target.rustTarget} Node addon and Rust \`kasb\` CLI from one build.${target.libc === "glibc" ? ` It requires glibc ${manifest.minimumGlibcVersion} or newer.` : ""} npm users install the root KASB package instead of depending on the platform package directly; direct CLI consumers use the accompanying target archive.\n`,
  );
  outputs.set(resolve(directory, "LICENSE.md"), license);
  outputs.set(resolve(directory, "THIRD_PARTY_LICENSES.html"), notices);
}

const stale = [];
for (const [path, expected] of outputs) {
  let actual;
  try {
    actual = await readFile(path, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (sameText(actual, expected)) continue;
  if (checkOnly) {
    stale.push(path.slice(repositoryRoot.length + 1));
  } else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, expected);
  }
}

function sameText(actual, expected) {
  if (actual === undefined) return false;
  return actual.replaceAll("\r\n", "\n") === expected.replaceAll("\r\n", "\n");
}

if (stale.length > 0) {
  console.error(`Generated native package metadata is stale:\n${stale.map((path) => `- ${path}`).join("\n")}`);
  process.exit(1);
}

console.log(checkOnly ? "native package metadata is current" : "generated native package metadata");
