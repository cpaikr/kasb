import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function workspaceVersion(source) {
  const section = source.match(/^\[workspace\.package\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/mu)?.[1];
  const version = section?.match(/^version\s*=\s*"([^"]+)"\s*$/mu)?.[1];
  assert.match(version ?? "", /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u, "Cargo workspace requires a stable release version");
  return version;
}

export function bumpWorkspace(source, version) {
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u, "release version must be stable SemVer");
  const previous = workspaceVersion(source);
  const a = version.split(".").map(BigInt);
  const b = previous.split(".").map(BigInt);
  const difference = a.findIndex((value, index) => value !== b[index]);
  assert(difference >= 0 && a[difference] > b[difference], "release version must increase");
  return source.replace(/(^\[workspace\.package\]\s*$[\s\S]*?^version\s*=\s*")[^"]+("\s*$)/mu, (_, prefix, suffix) => `${prefix}${version}${suffix}`);
}

export function syncBunWorkspaceVersions(source, packages) {
  // Bun 1.3.13 retains stale workspace versions on install, even with --force.
  // Update only manifest-derived workspace identity; preserve resolution bytes.
  const section = source.match(/^(  "workspaces": )(\{[\s\S]*?^  \}),?$/mu);
  assert(section, "bun.lock workspace metadata is missing");
  const workspaces = JSON.parse(section[2].replace(/,\s*([}\]])/gu, "$1"));
  for (const [path, pkg] of packages) {
    assert.equal(workspaces[path]?.name, pkg.name, `bun.lock workspace ${path} identity differs`);
    workspaces[path].version = pkg.version;
    if (pkg.optionalDependencies) workspaces[path].optionalDependencies = pkg.optionalDependencies;
  }
  const serialized = JSON.stringify(workspaces, null, 2).replace(/\n/gu, "\n  ");
  return source.replace(section[0], `${section[1]}${serialized},`);
}

export function releaseVersion(mode, value, root = process.cwd()) {
  const run = (command, args) => execFileSync(command, args, {
    cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
  if (mode === "upstream") {
    assert.equal(run("git", ["status", "--porcelain"]), "", "release preparation requires a clean checkout");
    assert.equal(run("git", ["branch", "--show-current"]), "main");
    assert.equal(run("git", ["rev-parse", "--abbrev-ref", "@{upstream}"]), "origin/main");
    run("git", ["fetch", "origin", "main"]);
    assert.equal(run("git", ["rev-parse", "HEAD"]), run("git", ["rev-parse", "origin/main"]), "release preparation requires freshly synchronized origin/main");
    return;
  }
  assert(["sync", "check", "source"].includes(mode), "usage: release-version.mjs upstream | sync <version> | check | source <tag>");
  const manifest = resolve(root, "Cargo.toml");
  if (mode === "sync") {
    const bumped = bumpWorkspace(readFileSync(manifest, "utf8"), value);
    const cliManifest = resolve(root, "crates/kasb-cli/Cargo.toml");
    const cli = readFileSync(cliManifest, "utf8");
    const dependency = /^(kasb = \{ path = "\.\.\/kasb", version = ")[^"]+(" \})$/mu;
    assert.match(cli, dependency, "CLI SDK dependency must retain its versioned path form");
    writeFileSync(manifest, bumped);
    writeFileSync(cliManifest, cli.replace(dependency, (_, prefix, suffix) => `${prefix}${value}${suffix}`));
  }
  const version = workspaceVersion(readFileSync(manifest, "utf8"));
  if (mode === "source") {
    assert.equal(value, `v${version}`, "release tag must match Cargo workspace version");
    assert.equal(run("git", ["rev-parse", "HEAD"]), run("git", ["rev-parse", `refs/tags/${value}^{commit}`]), "release tag must identify the checkout");
    run("git", ["merge-base", "--is-ancestor", "HEAD", "origin/main"]);
    return;
  }
  const metadata = JSON.parse(run("cargo", ["metadata", "--offline", ...(mode === "check" ? ["--locked"] : []), "--format-version", "1"]));
  for (const member of metadata.packages.filter(({ id }) => metadata.workspace_members.includes(id))) {
    assert.equal(member.version, version, `${member.name} must match Cargo workspace version`);
  }
  if (mode === "sync") {
    run(process.execPath, ["scripts/check-third-party-licenses.mjs", "--write"]);
    run(process.execPath, ["scripts/generate-native-packages.mjs"]);
    run(process.execPath, ["scripts/generate-release-assets.mjs"]);
    const targets = JSON.parse(readFileSync(resolve(root, "native-targets.json"), "utf8"));
    const paths = [targets.rootPackage, ...targets.targets.map(({ packageDirectory }) => `${targets.nativePackageRoot}/${packageDirectory}`)];
    const packages = paths.map((path) => [path, JSON.parse(readFileSync(resolve(root, path, "package.json"), "utf8"))]);
    const bunLock = resolve(root, "bun.lock");
    writeFileSync(bunLock, syncBunWorkspaceVersions(readFileSync(bunLock, "utf8"), packages));
    run("bun", ["install", "--frozen-lockfile", "--ignore-scripts"]);
  } else {
    run(process.execPath, ["scripts/validate-release-contract.mjs"]);
  }
  process.stdout.write(`Release version ${version}: ${mode} passed\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  releaseVersion(...process.argv.slice(2));
}
