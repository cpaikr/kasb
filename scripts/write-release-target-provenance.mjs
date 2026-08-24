import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { loadReleaseContract, repositoryRoot } from "./release-contract.mjs";

const options = parseOptions(process.argv.slice(2));
const contract = await loadReleaseContract();
const target = contract.targets.find(({ rustTarget }) => rustTarget === options.target);
if (!target) throw new Error(`Unknown release target: ${options.target}`);
if (options.repository !== contract.release.repository) throw new Error("Provenance repository does not match the release contract.");
if (!/^[0-9a-f]{40}$/u.test(options.commit)) throw new Error("Provenance commit must be a full lowercase Git SHA.");
if (options.runner !== target.releaseRunner) throw new Error("Provenance runner does not match the release target.");
if (options.buildImage !== (target.buildContainer ?? "")) throw new Error("Provenance build image does not match the release target.");

const sourceRef = boundedIdentity(options.ref, "source ref");
const runnerOs = boundedIdentity(process.env.RUNNER_OS, "RUNNER_OS");
const runnerArch = boundedIdentity(process.env.RUNNER_ARCH, "RUNNER_ARCH");
const rust = boundedIdentity(options.rust, "Rust identity");
const npm = boundedIdentity(options.npm, "npm identity");
if (!rust.startsWith(`rustc ${contract.release.toolchain.rust} `)) throw new Error("Rust execution identity differs from the release toolchain pin.");
if (process.versions.node.split(".")[0] !== contract.release.toolchain.node) throw new Error("Node execution identity differs from the release toolchain pin.");
if (npm !== contract.release.toolchain.npm) throw new Error("npm execution identity differs from the release toolchain pin.");
const output = resolve(repositoryRoot, "dist/provenance/fragments", `${options.target}.json`);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({
  schemaVersion: 1,
  repository: options.repository,
  version: contract.version,
  sourceRef,
  commit: options.commit,
  toolchain: { ...contract.release.toolchain },
  target: {
    rustTarget: target.rustTarget,
    releaseTarget: target.releaseTarget,
    packageName: target.packageName,
    archiveName: target.archiveName,
    runner: { label: options.runner, os: runnerOs, arch: runnerArch },
    buildImage: options.buildImage || null,
  },
})}\n`, { flag: "wx" });

function parseOptions(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error("Provenance options must be --name value pairs.");
    const name = key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    if (Object.hasOwn(result, name)) throw new Error(`Duplicate provenance option: ${key}`);
    result[name] = value;
  }
  const expected = ["buildImage", "commit", "npm", "ref", "repository", "runner", "rust", "target"];
  if (JSON.stringify(Object.keys(result).sort()) !== JSON.stringify(expected)) {
    throw new Error(`Expected provenance options: ${expected.map((name) => `--${name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}`).join(", ")}.`);
  }
  return result;
}

function boundedIdentity(value, name) {
  if (typeof value !== "string" || value.length === 0 || value.length > 128 || /[\r\n\0]/u.test(value)) {
    throw new Error(`${name} is missing or unbounded.`);
  }
  return value;
}
