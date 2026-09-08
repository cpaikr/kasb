import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { bumpWorkspace, releaseVersion, workspaceVersion, syncBunWorkspaceVersions } from "./release-version.mjs";
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

test("preparation cannot publish locally and verifies before committing", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const config = pkg["release-it"];
  assert.equal(config.npm, false);
  assert.equal(config.github.release, false);
  assert.equal(config.git.requireCleanWorkingDir, true);
  assert.equal(config.git.requireBranch, "main");
  assert.equal(config.hooks["before:init"], "node scripts/release-version.mjs upstream");
  assert.deepEqual(config.hooks["after:bump"], ["node scripts/release-version.mjs check", "bun run verify"]);
  assert.equal(Object.keys(config.plugins)[0], "./scripts/release-it-cargo.mjs");
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
