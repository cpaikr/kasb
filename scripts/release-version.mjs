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

// A release-it changelog section starts with `## [<version>](<compare URL>)`.
export function hasChangelogEntry(changelog, version) {
  return changelog.split("\n").some((line) => line.startsWith(`## [${version}]`));
}

// Exact-commit CI evidence: the deterministic gate succeeded and nothing on
// the commit is failing or still running.
export function tagEvidence(checks) {
  return checks.some(({ name, conclusion }) => name === "Deterministic validation" && conclusion === "success")
    && checks.every(({ status, conclusion }) => status === "completed" && ["success", "skipped", "neutral"].includes(conclusion));
}

export function releaseVersion(mode, value, root = process.cwd()) {
  const run = (command, args) => execFileSync(command, args, {
    cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
  if (mode === "prepare") {
    // Preparation is a reviewed change: it starts from current main on a
    // branch and reaches main only through a pull request.
    assert.equal(run("git", ["status", "--porcelain"]), "", "release preparation requires a clean checkout");
    const branch = run("git", ["branch", "--show-current"]);
    // An empty name is a detached HEAD, which leaves no branch for the PR.
    assert(branch !== "" && branch !== "main", "release preparation runs on a named branch, not main or a detached HEAD");
    run("git", ["fetch", "origin", "main"]);
    assert.equal(run("git", ["rev-parse", "HEAD"]), run("git", ["rev-parse", "origin/main"]), "release preparation requires a branch at freshly fetched origin/main");
    return;
  }
  if (mode === "tag") {
    // The operator owns the tag; CI owns certification. The operator names the
    // reviewed release commit, so later work on main can never be published
    // under that version.
    assert.match(value ?? "", /^[0-9a-f]{40}$/u, "usage: release-version.mjs tag <full release commit SHA>");
    run("git", ["fetch", "origin", "main", "--tags"]);
    const sha = value;
    run("git", ["merge-base", "--is-ancestor", sha, "origin/main"]);
    const version = workspaceVersion(run("git", ["show", `${sha}:Cargo.toml`]));
    const tag = `v${version}`;
    assert(hasChangelogEntry(run("git", ["show", `${sha}:CHANGELOG.md`]), version), `${sha} has no ${version} changelog entry; tag the merged release preparation`);
    // A failed lookup throws; it is never evidence that the tag is unused.
    assert.equal(run("git", ["ls-remote", "--refs", "origin", `refs/tags/${tag}`]), "", `${tag} already exists on origin`);
    const { repository } = JSON.parse(run("git", ["show", `${sha}:native-targets.json`])).release;
    const pages = run("gh", ["api", "--paginate", `repos/${repository}/commits/${sha}/check-runs?per_page=100`,
      "--jq", "{total: .total_count, runs: [.check_runs[] | {name, status, conclusion}]}"]);
    const parsed = pages.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    const checks = parsed.flatMap(({ runs }) => runs);
    // Never judge a partial listing.
    assert(parsed.length > 0 && checks.length === parsed[0].total, `incomplete check-run listing for ${sha}`);
    assert(tagEvidence(checks), `${sha} lacks successful CI evidence`);
    // Reuse a local tag left by a failed push only if it names this commit.
    const local = run("git", ["tag", "--list", tag]);
    if (local === "") {
      run("git", ["tag", "-a", tag, sha, "-m", `Release ${version}`]);
    } else {
      assert.equal(run("git", ["rev-parse", `refs/tags/${tag}^{commit}`]), sha, `local ${tag} names another commit; inspect and delete it before retrying`);
    }
    run("git", ["push", "origin", `refs/tags/${tag}`]);
    process.stdout.write(`Tagged ${sha} as ${tag}; tag-triggered CI now certifies and publishes\n`);
    return;
  }
  assert(["sync", "check", "source"].includes(mode), "usage: release-version.mjs prepare | sync <version> | check | tag <sha> | source <tag>");
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
