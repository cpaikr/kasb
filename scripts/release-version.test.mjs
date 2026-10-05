import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { bumpWorkspace, hasChangelogEntry, releaseVersion, tagEvidence, workspaceVersion, syncBunWorkspaceVersions } from "./release-version.mjs";
import CargoVersion from "./release-it-cargo.mjs";

const source = '[workspace]\nmembers = []\n[workspace.package]\nversion = "0.3.0"\nedition = "2021"\n[dependencies]\nexample = { version = "1.0.0" }\n';

test("Cargo bump changes only the authority and rejects invalid or nonincreasing releases", () => {
  assert.equal(workspaceVersion(source), "0.3.0");
  assert.equal(bumpWorkspace(source, "0.4.0"), source.replace('"0.3.0"', '"0.4.0"'));
  for (const version of ["0.3.0", "0.2.9", "0.4.0-beta.1", "01.0.0", "1.0.0; echo unsafe"]) {
    assert.throws(() => bumpWorkspace(source, version));
  }
  assert.throws(() => workspaceVersion('[package]\nversion = "1.0.0"'));
});

test("release-it routes Cargo writes through its dry-run-aware shell", async () => {
  const plugin = new CargoVersion();
  const calls = [];
  plugin.exec = async (...args) => calls.push(args);
  await plugin.bump("0.4.0");
  assert.deepEqual(calls, [["node scripts/release-version.mjs sync ${version}", { options: { external: true }, context: { version: "0.4.0" } }]]);
});

test("real Git source gate rejects wrong versions, different commits and off-main tags", () => {
  const root = mkdtempSync(join(tmpdir(), "kasb-release-source-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" }).toString().trim();
  try {
    git("init", "-b", "main");
    git("config", "user.email", "fixture@example.invalid");
    git("config", "user.name", "Release fixture");
    writeFileSync(join(root, "Cargo.toml"), source);
    git("add", "."); git("commit", "-m", "fixture");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    git("tag", "-a", "v0.3.0", "-m", "fixture release");
    releaseVersion("source", "v0.3.0", root);
    assert.throws(() => releaseVersion("source", "v0.4.0", root), /tag must match/u);
    git("checkout", "-b", "feature");
    writeFileSync(join(root, "new.txt"), "another revision\n");
    git("add", "."); git("commit", "-m", "off main");
    assert.throws(() => releaseVersion("source", "v0.3.0", root), /tag must identify/u);
    git("tag", "-d", "v0.3.0"); git("tag", "v0.3.0");
    assert.throws(() => releaseVersion("source", "v0.3.0", root));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("preparation commits on a branch and cannot tag, push, or publish", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const config = pkg["release-it"];
  assert.equal(config.npm, false);
  assert.equal(config.github.release, false);
  assert.equal(config.git.requireCleanWorkingDir, true);
  assert.equal(config.git.commit, true);
  assert.equal(config.git.tag, false);
  assert.equal(config.git.push, false);
  assert.equal(config.hooks["before:init"], "node scripts/release-version.mjs prepare");
  assert.deepEqual(config.hooks["after:bump"], ["node scripts/release-version.mjs check"]);
  assert.equal(Object.keys(config.plugins)[0], "./scripts/release-it-cargo.mjs");
  assert.equal(pkg.scripts["release:prepare"], "release-it");
  assert.equal(pkg.scripts["release:tag"], "node scripts/release-version.mjs tag");
  assert.equal(pkg.scripts.release, undefined);
});

test("preparation refuses main and a branch that is not at origin/main", () => {
  const root = mkdtempSync(join(tmpdir(), "kasb-release-prepare-"));
  const origin = mkdtempSync(join(tmpdir(), "kasb-release-origin-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" }).toString().trim();
  try {
    execFileSync("git", ["init", "--bare", "-b", "main"], { cwd: origin, stdio: "pipe" });
    git("init", "-b", "main");
    git("config", "user.email", "fixture@example.invalid");
    git("config", "user.name", "Release fixture");
    writeFileSync(join(root, "Cargo.toml"), source);
    git("add", "."); git("commit", "-m", "fixture");
    git("remote", "add", "origin", origin);
    git("push", "origin", "main");
    assert.throws(() => releaseVersion("prepare", undefined, root), /named branch/u);
    git("checkout", "--detach");
    assert.throws(() => releaseVersion("prepare", undefined, root), /detached HEAD/u);
    git("checkout", "main");
    git("checkout", "-b", "release/next");
    releaseVersion("prepare", undefined, root);
    writeFileSync(join(root, "new.txt"), "ahead of main\n");
    assert.throws(() => releaseVersion("prepare", undefined, root), /clean checkout/u);
    git("add", "."); git("commit", "-m", "ahead");
    assert.throws(() => releaseVersion("prepare", undefined, root), /freshly fetched origin\/main/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(origin, { recursive: true, force: true });
  }
});

test("tagging requires the version's changelog section", () => {
  const changelog = "# Changelog\n\n## [0.5.0](https://example.invalid) (2026-10-06)\n\n## [0.4.3](https://example.invalid)\n";
  assert.equal(hasChangelogEntry(changelog, "0.5.0"), true);
  assert.equal(hasChangelogEntry(changelog, "0.4.3"), true);
  assert.equal(hasChangelogEntry(changelog, "0.5"), false);
  assert.equal(hasChangelogEntry(changelog, "0.5.1"), false);
  assert.equal(hasChangelogEntry("text ## [0.5.0]", "0.5.0"), false);
});

test("tagging requires a full release commit SHA", () => {
  for (const value of [undefined, "", "HEAD", "abc123", "A".repeat(40)]) {
    assert.throws(() => releaseVersion("tag", value), /full release commit SHA/u);
  }
});

test("tagging requires successful, complete CI evidence on the exact commit", () => {
  const gate = { name: "Deterministic validation", status: "completed", conclusion: "success" };
  assert.equal(tagEvidence([gate, { name: "optional", status: "completed", conclusion: "skipped" }]), true);
  assert.equal(tagEvidence([]), false);
  assert.equal(tagEvidence([{ name: "other", status: "completed", conclusion: "success" }]), false);
  assert.equal(tagEvidence([{ ...gate, conclusion: "failure" }]), false);
  assert.equal(tagEvidence([gate, { name: "native", status: "in_progress", conclusion: null }]), false);
  assert.equal(tagEvidence([gate, { name: "native", status: "completed", conclusion: "failure" }]), false);
});

test("workspace lock synchronization preserves every third-party resolution byte", () => {
  const lock = readFileSync(new URL("../bun.lock", import.meta.url), "utf8");
  const pkg = JSON.parse(readFileSync(new URL("../packages/node/package.json", import.meta.url), "utf8"));
  const next = { ...pkg, version: "0.4.0", optionalDependencies: Object.fromEntries(Object.keys(pkg.optionalDependencies).map((name) => [name, "0.4.0"])) };
  const updated = syncBunWorkspaceVersions(lock, [["packages/node", next]]);
  const before = JSON.parse(lock.replace(/,\s*([}\]])/gu, "$1"));
  const after = JSON.parse(updated.replace(/,\s*([}\]])/gu, "$1"));
  assert.equal(after.workspaces["packages/node"].version, "0.4.0");
  assert.deepEqual(after.workspaces["packages/node"].optionalDependencies, next.optionalDependencies);
  assert.deepEqual(after.workspaces["packages/node"].devDependencies, before.workspaces["packages/node"].devDependencies);
  assert.equal(updated.slice(updated.indexOf('  "packages":')), lock.slice(lock.indexOf('  "packages":')));
  assert.throws(() => syncBunWorkspaceVersions(lock, [["packages/missing", next]]), /identity differs/u);
});
