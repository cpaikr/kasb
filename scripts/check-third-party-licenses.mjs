import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporary = await mkdtemp(resolve(tmpdir(), "kasb-licenses-"));
const generated = resolve(temporary, "THIRD_PARTY_LICENSES.html");
const write = process.argv.slice(2).includes("--write");
try {
  try {
    execFileSync("cargo", ["about", "generate", "about.hbs", "--output-file", generated], {
      cwd: repositoryRoot,
      stdio: "inherit",
    });
  } catch (error) {
    throw new Error("Could not regenerate third-party notices. Install cargo-about and retry.", { cause: error });
  }
  const noticesPath = resolve(repositoryRoot, "THIRD_PARTY_LICENSES.html");
  const actual = canonicalizeGeneratedHtml(await readFile(generated, "utf8"));
  if (write) {
    await writeFile(noticesPath, actual);
  }
  const expected = await readFile(noticesPath, "utf8");
  if (expected !== actual) {
    throw new Error("THIRD_PARTY_LICENSES.html is stale; regenerate it with bun run licenses:generate.");
  }
  await checkNodeBundleNotices();
  console.log("Rust and bundled Node third-party license notices are current");
} finally {
  await rm(temporary, { recursive: true, force: true });
}

function canonicalizeGeneratedHtml(value) {
  return `${value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd()}\n`;
}

async function checkNodeBundleNotices() {
  const packageRequire = createRequire(resolve(repositoryRoot, "packages/node/package.json"));
  const effectPackage = packageRequire.resolve("effect/package.json");
  const effectRequire = createRequire(effectPackage);
  const bundled = [
    await dependencyNotice(effectPackage),
    await dependencyNotice(effectRequire.resolve("fast-check/package.json")),
  ];
  const generatedNotice = [
    "# Third-party licenses",
    "",
    "The packaged Node toolset bundles the following dependencies.",
    "",
    ...bundled.flatMap(({ name, version, license }) => [
      `## ${name} ${version}`,
      "",
      license.trim(),
      "",
    ]),
  ].join("\n");
  const committedNotice = await readFile(
    resolve(repositoryRoot, "packages/node/THIRD_PARTY_LICENSES.md"),
    "utf8",
  );
  if (committedNotice !== generatedNotice) {
    throw new Error("packages/node/THIRD_PARTY_LICENSES.md is stale; regenerate it from installed bundled dependencies.");
  }
}

async function dependencyNotice(packageJsonPath) {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const license = await readFile(resolve(dirname(packageJsonPath), "LICENSE"), "utf8");
  return { name: packageJson.name, version: packageJson.version, license };
}
