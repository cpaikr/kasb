import { afterAll, beforeAll, expect, test, setDefaultTimeout } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import Ajv from "ajv";
import { cliSuccessCases, createFixtureConfig, expectedCliValue, inspectCliProcess, loadManifest, semanticCaseFor, type CliProcessObservation } from "./cli-judge.ts";

setDefaultTimeout(180_000);
const root = join(import.meta.dir, "..");
const manifest = loadManifest(root);
const fixtureReleases = JSON.parse(readFileSync(join(root, "fixtures/version-check/releases.json"), "utf8"));
const schema = JSON.parse(readFileSync(join(import.meta.dir, "version-check.schema.json"), "utf8"));
const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
const binary = join(root, "target/cli-conformance-fixtures/debug", process.platform === "win32" ? "kasb.exe" : "kasb");
let temporary = "";
let serial = 0;
let currentVersion = "";
let requests: string[] = [];
let route: (url: URL) => Response | Promise<Response> = () => Response.json(fixtureReleases);
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) { const url = new URL(request.url); requests.push(url.pathname + url.search); return route(url); } });
const origin = `http://127.0.0.1:${server.port}`;
const listPath = "/repos/cpaikr/kasb/releases?per_page=100&page=1";

beforeAll(() => {
  temporary = realpathSync(mkdtempSync(join(tmpdir(), "kasb-version-check-")));
  const build = spawnSync("cargo", ["build", "--locked", "-p", "kasb-cli", "--bin", "kasb", "--features", "conformance-fixtures", "--target-dir", join(root, "target/cli-conformance-fixtures")], { cwd: root, encoding: "utf8", timeout: 180_000 });
  expect(build.status, build.stderr).toBe(0);
  const version = spawnSync(binary, ["--version"], { encoding: "utf8" });
  currentVersion = version.stdout.trim().replace(/^kasb /, "");
});
afterAll(() => { server.stop(true); if (temporary) rmSync(temporary, { recursive: true, force: true }); });

function context() {
  const directory = join(temporary, `case-${++serial}`); mkdirSync(directory);
  requests = []; route = () => Response.json(fixtureReleases);
  const env = { ...process.env, HOME: directory, XDG_CACHE_HOME: directory, LOCALAPPDATA: directory, CI: "1", KASB_NO_VERSION_CHECK: "0", KASB_UPGRADE_TEST_ALLOW_NONCANONICAL_URLS: "1", KASB_UPGRADE_TEST_LATEST_URL: `${origin}/repos/cpaikr/kasb/releases/latest` };
  delete env.KASB_CLI_CONFORMANCE_CONFIG;
  return { directory, env };
}
async function run(argv: readonly string[], env: Record<string, string | undefined>, executable = binary, cwd = root): Promise<CliProcessObservation> {
  const child = Bun.spawn({ cmd: [executable, ...argv], env, cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  return { stdout, stderr, exitCode, signal: child.signalCode ?? null };
}
function report(output: CliProcessObservation) {
  expect(output.exitCode).toBe(0); expect(output.signal).toBeNull(); expect(output.stderr).toBe(""); expect(output.stdout.endsWith("\n")).toBe(true);
  const value = JSON.parse(output.stdout);
  const evidence = value.result?.versionCheck ?? value.advisories?.versionCheck;
  expect(validate(evidence), JSON.stringify(validate.errors)).toBe(true);
  expect(Buffer.byteLength(JSON.stringify(evidence))).toBeLessThanOrEqual(8192);
  if (evidence.release) {
    expect(evidence.release.tag).toBe(`v${evidence.release.version}`);
    expect(evidence.release.url).toBe(`https://github.com/cpaikr/kasb/releases/tag/${evidence.release.tag}`);
  }
  return evidence;
}
function cachePath(directory: string) {
  const cache = process.platform === "darwin" ? join(directory, "Library/Caches/kasb") : process.platform === "win32" ? join(directory, "kasb/cache") : join(directory, "kasb");
  return join(cache, readdirSync(cache).find(name => name.endsWith(".json"))!);
}
function changeCache(directory: string, mutate: (value: any) => void) { const path = cachePath(directory); const value = JSON.parse(readFileSync(path, "utf8")); mutate(value); writeFileSync(path, JSON.stringify(value)); }
function releaseVersion(version: string) {
  const release = structuredClone(fixtureReleases[1]); release.tag_name = `v${version}`; release.html_url = `https://github.com/cpaikr/kasb/releases/tag/v${version}`;
  for (const asset of release.assets) { asset.name = asset.name.replace("0.4.0", version); asset.browser_download_url = `https://github.com/cpaikr/kasb/releases/download/v${version}/${asset.name}`; }
  return release;
}

test("explicit cold/warm evidence is independent of provider initialization and working directory", async () => {
  const { directory, env } = context();
  const cold = report(await run(["version-check", "--pretty"], { ...env, KASB_CLI_CONFORMANCE_CONFIG: "missing-initialization-config" }));
  expect(cold.comparison).toBe("newer"); expect(cold.freshness).toBe("fresh"); expect(cold.release.version).toBe("0.4.0"); expect(cold.installation.owner).toBe("unknown"); expect(cold.currentVersion).toBe(currentVersion);
  expect(requests).toEqual([listPath]);
  const other = join(directory, "other-working-directory"); mkdirSync(other);
  const warm = report(await run(["version-check"], env, binary, other));
  expect(warm.observedAt).toBe(cold.observedAt); expect(requests).toEqual([listPath]);
});

test("every content projection keeps one JSON document and exact primary fields with default-on CI advisories", async () => {
  const { directory, env } = context();
  for (const cliCase of cliSuccessCases) {
    const caseDirectory = join(directory, cliCase.id); mkdirSync(caseDirectory);
    const config = createFixtureConfig(root, semanticCaseFor(manifest, cliCase), caseDirectory);
    const output = await run(cliCase.argv, { ...env, KASB_CLI_CONFORMANCE_CONFIG: config });
    const evidence = report(output); expect(evidence.comparison).toBe("newer");
    const value = JSON.parse(output.stdout); delete value.advisories;
    expect(inspectCliProcess({ ...output, stdout: `${JSON.stringify(value)}\n` }, expectedCliValue(root, manifest, cliCase), manifest)).toEqual([]);
  }
  expect(requests).toEqual([listPath]);
});

test("fresh equal, ahead and confirmed absence are explicit and incidentally quiet", async () => {
  for (const [releases, comparison] of [[[releaseVersion(currentVersion)], "equal"], [[releaseVersion("0.3.0")], "ahead"], [[], "noStableRelease"]] as const) {
    const { directory, env } = context(); route = () => Response.json(releases);
    const evidence = report(await run(["version-check"], env)); expect(evidence.comparison).toBe(comparison);
    const cliCase = cliSuccessCases[0]!; const config = createFixtureConfig(root, semanticCaseFor(manifest, cliCase), directory);
    const output = await run(cliCase.argv, { ...env, KASB_CLI_CONFORMANCE_CONFIG: config });
    expect(inspectCliProcess(output, expectedCliValue(root, manifest, cliCase), manifest)).toEqual([]);
    expect(requests).toEqual([listPath]);
  }
});

test("failed refresh preserves stale evidence and observation time, cooldown, and forced-refresh precedence", async () => {
  const { directory, env } = context();
  report(await run(["version-check"], env));
  changeCache(directory, value => { value.observation.observedAt -= 7 * 3600; });
  const old = JSON.parse(readFileSync(cachePath(directory), "utf8")).observation.observedAt;
  route = () => new Response("private error body secret", { status: 429 });
  const stale = report(await run(["version-check"], env)); expect(stale.freshness).toBe("stale"); expect(stale.observedAt).toBe(old); expect(stale.ageSeconds).toBeGreaterThanOrEqual(7 * 3600); expect(stale.problems).toContain("refreshFailed");
  expect(JSON.stringify(stale)).not.toContain("secret");
  report(await run(["version-check"], env)); expect(requests).toHaveLength(2);
  report(await run(["--no-version-check", "version-check", "--refresh"], { ...env, KASB_NO_VERSION_CHECK: "1" })); expect(requests).toHaveLength(3);
  route = () => Response.json(fixtureReleases);
  const fresh = report(await run(["version-check", "--refresh"], env)); expect(fresh.freshness).toBe("fresh"); expect(fresh.observedAt).toBeGreaterThan(old);
});

test("cold failure is unavailable and cooldown avoids duplicate failed requests", async () => {
  const { env } = context(); route = () => new Response("offline", { status: 503 });
  const unavailable = report(await run(["version-check"], env)); expect(unavailable.comparison).toBe("unavailable"); expect(unavailable.freshness).toBe("unavailable"); expect(unavailable.release).toBeUndefined();
  report(await run(["version-check"], env)); expect(requests).toHaveLength(1);
});

test("comparison is recomputed after replacing cached current-version assumptions", async () => {
  const { directory, env } = context(); report(await run(["version-check"], env));
  changeCache(directory, value => { value.observation.release.version = currentVersion; value.observation.release.tag = `v${currentVersion}`; value.observation.release.url = `https://github.com/cpaikr/kasb/releases/tag/v${currentVersion}`; });
  const evidence = report(await run(["version-check"], env)); expect(evidence.comparison).toBe("equal"); expect(evidence.currentVersion).toBe(currentVersion); expect(requests).toHaveLength(1);
});

test("clock rollback and invalid cache state never suppress refresh or clobber unrelated bytes", async () => {
  const { directory, env } = context(); report(await run(["version-check"], env));
  changeCache(directory, value => { value.observation.observedAt += 86400; value.failedAt = value.observation.observedAt; });
  const corrected = report(await run(["version-check"], env)); expect(corrected.problems).toContain("cacheInvalid"); expect(requests).toHaveLength(2);
  const path = cachePath(directory);
  for (const bytes of ["unrelated-file", "x".repeat(65537), JSON.stringify({ schemaVersion: 999, key: "foreign" })]) {
    writeFileSync(path, bytes); const evidence = report(await run(["version-check"], env)); expect(evidence.problems).toContain("cacheInvalid"); expect(readFileSync(path, "utf8")).toBe(bytes);
  }
});

test("highest release readiness remains incomplete for missing, duplicate, mutable, bad-url and oversized assets", async () => {
  for (const corrupt of ["missing", "duplicate", "mutable", "url", "size"]) {
    const { env } = context(); const releases = structuredClone(fixtureReleases);
    if (corrupt === "missing") releases[1].assets = [];
    if (corrupt === "duplicate") releases[1].assets.push(...structuredClone(releases[1].assets));
    if (corrupt === "mutable") releases[1].immutable = false;
    if (corrupt === "url") for (const asset of releases[1].assets) asset.browser_download_url = "https://evil.example/file";
    if (corrupt === "size") for (const asset of releases[1].assets) asset.size = 999_999_999;
    route = () => Response.json(releases);
    const evidence = report(await run(["version-check"], env)); expect(evidence.comparison).toBe("newer"); expect(evidence.release.version).toBe("0.4.0"); expect(evidence.distribution.status).toBe("incomplete"); expect(requests).toEqual([listPath]);
  }
});

test("help, exact version, invalid input, provider and initialization failures skip all ancillary access", async () => {
  const { directory, env } = context();
  const failedConfig = join(directory, "failure.json"); writeFileSync(failedConfig, JSON.stringify({ routes: [], callsPath: join(directory, "calls.jsonl") }));
  for (const argv of [["--help"], ["--version"], ["help", "version-check"], ["version-check", "--bogus"], ["search-standards", "--keyword", ""], ["get-qna", "--doc-number", "SSI-35629"]]) {
    await run(argv, { ...env, KASB_CLI_CONFORMANCE_CONFIG: failedConfig });
  }
  await run(["get-qna", "--doc-number", "SSI-35629"], { ...env, KASB_CLI_CONFORMANCE_CONFIG: "missing" });
  expect(requests).toEqual([]); expect(existsSync(join(directory, "Library"))).toBe(false); expect(existsSync(join(directory, "kasb"))).toBe(false);
});

test("flag and exact environment opt-outs skip cache and inspection; other values preserve checking", async () => {
  for (const [extra, value, excluded] of [[["--no-version-check"], "0", true], [[], "1", true], [[], "true", false], [[], "", false]] as const) {
    const { directory, env } = context(); const cliCase = cliSuccessCases[0]!;
    const config = createFixtureConfig(root, semanticCaseFor(manifest, cliCase), directory);
    const output = await run([...extra, ...cliCase.argv], { ...env, KASB_NO_VERSION_CHECK: value, KASB_CLI_CONFORMANCE_CONFIG: config });
    if (excluded) { expect(inspectCliProcess(output, expectedCliValue(root, manifest, cliCase), manifest)).toEqual([]); expect(requests).toEqual([]); expect(existsSync(join(directory, "Library"))).toBe(false); expect(existsSync(join(directory, "kasb"))).toBe(false); }
    else { expect(report(output).comparison).toBe("newer"); expect(requests).toEqual([listPath]); }
  }
});

test("receipt hints never authorize replacement, while exact standalone ownership recommends explicit upgrade", async () => {
  const { directory, env } = context(); const installation = join(directory, "managed"); mkdirSync(installation);
  const executable = join(installation, process.platform === "win32" ? "kasb.exe" : "kasb"); copyFileSync(binary, executable);
  const contract = JSON.parse(readFileSync(join(root, "native-targets.json"), "utf8"));
  const target = contract.targets.find((target: any) => target.npmPlatform === process.platform && target.npmArch === process.arch);
  const receiptPath = join(installation, contract.release.receiptFile);
  const receipt = { schemaVersion: 1, manager: "standalone", version: currentVersion, target: target.packageDirectory, executable, releaseRepository: "cpaikr/kasb", releaseTag: `v${currentVersion}`, assetName: `kasb-${currentVersion}-${target.packageDirectory}.tar.gz`, sha256: createHash("sha256").update(readFileSync(executable)).digest("hex") };
  writeFileSync(receiptPath, JSON.stringify(receipt)); const before = readFileSync(receiptPath);
  const verified = report(await run(["version-check"], env, executable)); expect(verified.installation).toEqual({ owner: "standalone", verified: true, nextAction: "upgradeWithKasb" });
  expect(readFileSync(receiptPath)).toEqual(before); expect(createHash("sha256").update(readFileSync(executable)).digest("hex")).toBe(receipt.sha256);
  receipt.sha256 = "0".repeat(64); writeFileSync(receiptPath, JSON.stringify(receipt));
  const hint = report(await run(["version-check"], env, executable)); expect(hint.installation.verified).toBe(false); expect(hint.installation.nextAction).toBe("inspectInstallationOwner"); expect(hint.problems).toContain("inspectionFailed");
});

test("npm and Cargo path hints route to their owner without claiming registry availability", async () => {
  for (const owner of ["npm", "cargo"]) {
    const { directory, env } = context(); const location = owner === "npm" ? join(directory, "node_modules/@sjunepark/kasb-native") : join(directory, ".cargo/bin"); mkdirSync(location, { recursive: true });
    const executable = join(location, process.platform === "win32" ? "kasb.exe" : "kasb"); copyFileSync(binary, executable);
    const evidence = report(await run(["version-check"], { ...env, CARGO_HOME: join(directory, ".cargo") }, executable)); expect(evidence.installation.owner).toBe(owner); expect(evidence.installation.verified).toBe(false); expect(evidence.installation.nextAction).toBe(owner === "npm" ? "consultNpmOwner" : "rebuildWithCargo"); expect(JSON.stringify(evidence)).not.toContain("npm install");
  }
});

test("independent advisory judge rejects corrupt reports and process or primary-result changes", async () => {
  const { directory, env } = context(); const cliCase = cliSuccessCases[0]!; const config = createFixtureConfig(root, semanticCaseFor(manifest, cliCase), directory);
  const output = await run(cliCase.argv, { ...env, KASB_CLI_CONFORMANCE_CONFIG: config }); const value = JSON.parse(output.stdout); const good = value.advisories.versionCheck;
  for (const corrupt of [{ ...good, comparison: "current" }, { ...good, ageSeconds: -1 }, { ...good, unexpected: true }, { ...good, freshness: "unavailable" }, { ...good, release: { ...good.release, url: "https://evil.example" } }]) expect(validate(corrupt)).toBe(false);
  delete value.advisories; const expected = expectedCliValue(root, manifest, cliCase);
  expect(inspectCliProcess({ ...output, exitCode: 1, stdout: `${JSON.stringify(value)}\n` }, expected, manifest).length).toBeGreaterThan(0);
  expect(inspectCliProcess({ ...output, stdout: `${JSON.stringify(value)}\nextra\n` }, expected, manifest).length).toBeGreaterThan(0);
  value.result = {}; expect(inspectCliProcess({ ...output, stdout: `${JSON.stringify(value)}\n` }, expected, manifest).length).toBeGreaterThan(0);
  expect(requests).toEqual([listPath]);
});

test("complete pagination selects across pages and rejects unfinished or untrusted navigation", async () => {
  const irrelevant = (index: number) => ({ ...releaseVersion("0.4.0"), tag_name: `other-${index}`, assets: [] });
  const fullPage = Array.from({ length: 100 }, (_, index) => irrelevant(index));
  {
    const { env } = context(); route = url => Number(url.searchParams.get("page")) === 1
      ? Response.json(fullPage, { headers: { link: `<${origin}/repos/cpaikr/kasb/releases?per_page=100&page=2>; rel="next"` } })
      : Response.json(fixtureReleases);
    const evidence = report(await run(["version-check"], env)); expect(evidence.release.version).toBe("0.4.0"); expect(requests).toHaveLength(2);
  }
  for (const failure of ["exhausted", "foreign", "truncated", "malformed", "oversized", "redirect", "duplicate", "release-url"]) {
    const { env } = context();
    route = url => {
      const page = Number(url.searchParams.get("page"));
      if (failure === "exhausted") return Response.json(fullPage, { headers: { link: `<${origin}/repos/cpaikr/kasb/releases?per_page=100&page=${page + 1}>; rel="next"` } });
      if (failure === "foreign") return Response.json(fullPage, { headers: { link: `<http://127.0.0.1:1/repos/cpaikr/kasb/releases?per_page=100&page=2>; rel="next"` } });
      if (failure === "truncated") return Response.json(fixtureReleases, { headers: { link: `<${origin}/repos/cpaikr/kasb/releases?per_page=100&page=2>; rel="next"` } });
      if (failure === "malformed") return new Response("not json");
      if (failure === "oversized") return new Response("x".repeat(1024 * 1024 + 1));
      if (failure === "redirect") return new Response(null, { status: 302, headers: { location: `${origin}/must-not-follow` } });
      if (failure === "duplicate") return Response.json([releaseVersion("0.4.0"), releaseVersion("0.4.0")]);
      return Response.json([{ ...releaseVersion("0.4.0"), html_url: "https://evil.example/release" }]);
    };
    const evidence = report(await run(["version-check"], env)); expect(evidence.comparison).toBe("unavailable"); expect(evidence.release).toBeUndefined(); expect(requests).toHaveLength(failure === "exhausted" ? 5 : 1);
  }
});

test("one aggregate byte limit applies across individually bounded pages", async () => {
  const { env } = context();
  const page = Array.from({ length: 100 }, (_, index) => ({ ...releaseVersion("0.4.0"), tag_name: `unrelated-${index}`, assets: [], ignoredPadding: "x".repeat(6000) }));
  route = url => Response.json(page, { headers: { link: `<${origin}/repos/cpaikr/kasb/releases?per_page=100&page=${Number(url.searchParams.get("page")) + 1}>; rel="next"` } });
  expect(report(await run(["version-check"], env)).comparison).toBe("unavailable"); expect(requests).toHaveLength(2);
});

async function awaitRequest(count: number) {
  const deadline = Date.now() + 5000;
  while (requests.length < count) { if (Date.now() > deadline) throw new Error("release request was not observed"); await Bun.sleep(10); }
}

test("concurrent cold processes share one refresh and crashed owners release the lock", async () => {
  const { env } = context();
  let resolveSlow!: (response: Response) => void;
  route = () => new Promise<Response>(resolve => { resolveSlow = resolve; });
  const owner = Bun.spawn({ cmd: [binary, "version-check"], env, stdout: "pipe", stderr: "pipe" });
  await awaitRequest(1);
  const start = performance.now(); const loser = report(await run(["version-check", "--refresh"], env));
  expect(loser.problems).toContain("refreshInProgress"); expect(loser.comparison).toBe("unavailable"); expect(performance.now() - start).toBeLessThan(1000); expect(requests).toHaveLength(1);
  owner.kill("SIGKILL"); await owner.exited; resolveSlow(Response.json(fixtureReleases));
  route = () => Response.json(fixtureReleases);
  expect(report(await run(["version-check"], env)).freshness).toBe("fresh"); expect(requests).toHaveLength(2);
});

test("slow refresh preserves stale success within the incidental budget and records cooldown", async () => {
  const { directory, env } = context(); report(await run(["version-check"], env)); changeCache(directory, value => { value.observation.observedAt -= 7 * 3600; });
  let finish!: (response: Response) => void; route = () => new Promise<Response>(resolve => { finish = resolve; });
  const cliCase = cliSuccessCases[0]!; const config = createFixtureConfig(root, semanticCaseFor(manifest, cliCase), directory);
  const start = performance.now(); const output = await run(cliCase.argv, { ...env, KASB_CLI_CONFORMANCE_CONFIG: config }); const elapsed = performance.now() - start;
  const evidence = report(output); expect(evidence.freshness).toBe("stale"); expect(evidence.problems).toContain("refreshTimedOut"); expect(elapsed).toBeLessThan(2500);
  finish(Response.json(fixtureReleases));
  report(await run(["version-check"], env)); expect(requests).toHaveLength(2);
});

if (process.platform !== "win32") {
  test("SIGINT and SIGTERM during incidental refresh preserve the successful primary result", async () => {
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      const { directory, env } = context(); let finish!: (response: Response) => void;
      route = () => new Promise<Response>(resolve => { finish = resolve; });
      const cliCase = cliSuccessCases[0]!; const config = createFixtureConfig(root, semanticCaseFor(manifest, cliCase), directory);
      const child = Bun.spawn({ cmd: [binary, ...cliCase.argv], env: { ...env, KASB_CLI_CONFORMANCE_CONFIG: config }, stdout: "pipe", stderr: "pipe" });
      await awaitRequest(1); child.kill(signal);
      const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      expect(inspectCliProcess({ stdout, stderr, exitCode, signal: child.signalCode ?? null }, expectedCliValue(root, manifest, cliCase), manifest)).toEqual([]);
      finish(Response.json(fixtureReleases));
    }
  });
  test("explicit version-check SIGINT remains an interrupted primary operation", async () => {
    const { env } = context(); let finish!: (response: Response) => void;
    route = () => new Promise<Response>(resolve => { finish = resolve; });
    const child = Bun.spawn({ cmd: [binary, "version-check"], env, stdout: "pipe", stderr: "pipe" });
    await awaitRequest(1); child.kill("SIGINT");
    expect(await child.exited).toBe(130); expect(await new Response(child.stdout).text()).toBe(""); expect(await new Response(child.stderr).text()).toBe("");
    finish(Response.json(fixtureReleases));
  });
}

test("all committed complete response examples satisfy the independent schema", () => {
  const examples = JSON.parse(readFileSync(join(root, "fixtures/version-check/reports.json"), "utf8"));
  for (const value of Object.values(examples) as any[]) {
    expect(validate(value.result.versionCheck), JSON.stringify(validate.errors)).toBe(true);
    expect(value.metadata).toEqual({ cliTransportVersion: "1", operation: "version-check" });
  }
});

test("missing cache roots permit explicit uncached evidence without installation authority", async () => {
  const { env } = context();
  const evidence = report(await run(["version-check"], { ...env, HOME: "", XDG_CACHE_HOME: "", LOCALAPPDATA: "" }));
  expect(evidence.comparison).toBe("newer"); expect(evidence.freshness).toBe("fresh"); expect(evidence.problems).toContain("cacheUnavailable"); expect(evidence.installation.verified).toBe(false); expect(requests).toEqual([listPath]);
});


test("global opt-out preserves command-specific parse failures", async () => {
  const { env } = context();
  const output = await run(["--no-version-check", "search-standards", "--query", "leases"], env);
  expect(output.exitCode).toBe(1);
  const value = JSON.parse(output.stdout);
  expect(value.metadata.operation).toBe("search-standards");
  expect(value.failure.message).toBe('Unknown option: "--query". Use --keyword instead.');
  expect(requests).toEqual([]);
});


test("a complete full terminal page is valid, including the fifth bounded page", async () => {
  for (const finalPage of [1, 5]) {
    const { env } = context();
    route = url => {
      const page = Number(url.searchParams.get("page"));
      const releases = Array.from({ length: 100 }, (_, index) => ({ ...releaseVersion("0.4.0"), tag_name: `unrelated-${page}-${index}`, assets: [] }));
      if (page === finalPage) { releases[99] = releaseVersion("0.4.0"); return Response.json(releases); }
      return Response.json(releases, { headers: { link: `<${origin}/repos/cpaikr/kasb/releases?per_page=100&page=${page + 1}>; rel="next"` } });
    };
    expect(report(await run(["version-check"], env)).release.version).toBe("0.4.0");
    expect(requests).toHaveLength(finalPage);
  }
});
