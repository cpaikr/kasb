import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  cliSuccessCases,
  createFixtureConfig,
  expectedCliValue,
  inspectCliFailureEnvelope,
  inspectCliProcess,
  inspectCliJsonFraming,
  loadManifest,
  readRecordedCalls,
  semanticCaseFor,
  truncateUtf16Safely,
  type CliProcessObservation,
} from "./cli-judge.ts";
import { readConformanceJson } from "./judge.ts";

const repoRoot = join(import.meta.dir, "..");
const manifest = loadManifest(repoRoot);
const executableName = process.platform === "win32" ? "kasb.exe" : "kasb";
const processTimeoutMs = 10_000;
const buildTimeoutMs = 180_000;
setDefaultTimeout(180_000);
let judgeRoot = "";
let fixtureBinary = "";
let productionBinary = "";

beforeAll(() => {
  judgeRoot = mkdtempSync(join(tmpdir(), "kasb-cli-process-"));
  fixtureBinary = buildBinary(join(repoRoot, "target", "cli-conformance-fixtures"), true);
  productionBinary = buildBinary(join(repoRoot, "target"), false);
}, buildTimeoutMs * 2 + 30_000);

afterAll(() => {
  if (judgeRoot.length > 0 && judgeRoot.includes("kasb-cli-process-")) {
    rmSync(judgeRoot, { recursive: true, force: true });
  }
});

describe("Rust CLI process judge", () => {
  for (const cliCase of cliSuccessCases) {
    test(`matches the committed ${cliCase.id} outcome and exact requests`, () => {
      const caseDirectory = join(judgeRoot, cliCase.id);
      mkdirSync(caseDirectory);
      const semanticCase = semanticCaseFor(manifest, cliCase);
      const configPath = createFixtureConfig(repoRoot, semanticCase, caseDirectory);
      const observation = runBinary(fixtureBinary, cliCase.argv, configPath);
      const expected = expectedCliValue(repoRoot, manifest, cliCase);

      expect(inspectCliProcess(observation, expected, manifest)).toEqual([]);
      expect([...readRecordedCalls(join(caseDirectory, "calls.jsonl"))].sort()).toEqual(
        semanticCase.routes.map((route) => route.requestUrl).sort(),
      );
      if (cliCase.argv.includes("--pretty")) {
        expect(observation.stdout.split("\n").length).toBeGreaterThan(2);
      }
    });
  }

  test.each([
    [[], "Usage: kasb <COMMAND>"],
    [["--help"], "Usage: kasb <COMMAND>"],
    [["help", "search-standards"], "Usage: kasb search-standards"],
    [["get-paragraph"], "Usage: kasb get-paragraph"],
    [["get-section", "--help"], "--index-document-id <text>"],
  ] as const)("renders human help for %j", (argv, expectedText) => {
    const observation = runBinary(productionBinary, argv);
    expect(observation.exitCode).toBe(0);
    expect(observation.signal).toBeNull();
    expect(observation.stderr).toBe("");
    expect(observation.stdout).toContain(expectedText);
    expect(() => JSON.parse(observation.stdout)).toThrow();
  });

  test.each([
    {
      argv: ["missing-command"],
      message: 'Unknown command: "missing-command".',
      operation: undefined,
    },
    {
      argv: ["help", "missing-command"],
      message: 'Unknown command: "missing-command".',
      operation: undefined,
    },
    {
      argv: ["search-qna", "--query", "리스"],
      message: 'Unknown option: "--query". Use --keyword instead.',
      operation: "search-qna",
    },
    {
      argv: ["get-paragraph", "--query", "리스"],
      message: 'Unknown option: "--query".',
      operation: "get-paragraph",
    },
    {
      argv: ["get-qna", "--doc-number", "x", "--output", "--pretty"],
      message: "error: option '--output <mode>' argument '--pretty' is invalid. Allowed choices are summary, structured, raw.",
      operation: "get-qna",
    },
    {
      argv: ["get-qna", "--doc-number", "x", "--output=summary", "--output=bogus"],
      message: "error: option '--output <mode>' argument 'bogus' is invalid. Allowed choices are summary, structured, raw.",
      operation: "get-qna",
    },
    {
      argv: ["get-qna", "--doc-number", "x", "--output=bogus", "--output", "summary"],
      message: "error: option '--output <mode>' argument 'bogus' is invalid. Allowed choices are summary, structured, raw.",
      operation: "get-qna",
    },
  ])("renders parse failure for $argv", ({ argv, message, operation }) => {
    const observation = runBinary(productionBinary, argv);
    const value = assertFailureProcess(observation);
    expect(value.failure).toMatchObject({ code: "invalid_input", message, retryable: false });
    expect(value.metadata).toEqual({
      cliTransportVersion: "1",
      ...(operation === undefined ? {} : { operation }),
    });
  });

  test("reports a real unknown option after a hyphen-leading value", () => {
    const value = assertFailureProcess(runBinary(productionBinary, [
      "search-standards", "--keyword", "-foo", "--bogus",
    ]));
    expect(value.failure.message).toBe('Unknown option: "--bogus".');
  });

  test("maps SDK validation back to the used alias and next action", () => {
    const observation = runBinary(productionBinary, [
      "search-qna", "--keyword", "리스", "--rows", "10", "--limit", "999",
    ]);
    const value = assertFailureProcess(observation);
    expect(value.failure).toMatchObject({
      code: "invalid_input",
      parameter: "rows",
      cliOption: "--limit",
      nextAction: {
        operation: "search-qna",
        input: { keyword: "리스", rows: 50 },
        command: "kasb search-qna --keyword '리스' --limit 50 --output summary",
      },
    });
  });

  test("keeps overflowing digit arguments in SDK-owned range validation", () => {
    const observation = runBinary(productionBinary, [
      "search-qna", "--keyword", "리스", "--limit", "184467440737095516160",
    ]);
    const value = assertFailureProcess(observation);
    expect(value.failure).toMatchObject({
      code: "invalid_input",
      message: 'Option "--limit" must be between 1 and 50.',
      parameter: "rows",
      cliOption: "--limit",
      nextAction: {
        operation: "search-qna",
        input: { keyword: "리스", rows: 50 },
      },
    });
  });

  test("keeps non-finite digit arguments in SDK-owned integer validation", () => {
    const observation = runBinary(productionBinary, [
      "search-qna", "--keyword", "리스", "--limit", "9".repeat(400),
    ]);
    const value = assertFailureProcess(observation);
    expect(value.failure).toMatchObject({
      code: "invalid_input",
      message: 'Option "--limit" must be an integer.',
      parameter: "rows",
      cliOption: "--limit",
      nextAction: {
        operation: "search-qna",
        input: { keyword: "리스", rows: 50 },
      },
    });
  });

  test("keeps --limit precedence when --rows appears later", () => {
    const observation = runBinary(productionBinary, [
      "search-qna", "--keyword", "리스", "--limit", "999", "--rows", "10",
    ]);
    const value = assertFailureProcess(observation);
    expect(value.failure).toMatchObject({
      parameter: "rows",
      cliOption: "--limit",
      nextAction: { input: { keyword: "리스", rows: 50 } },
    });
  });

  test("uses the last repeated value while keeping cross-alias precedence", () => {
    const cliCase = cliSuccessCases.find(
      (candidate) => candidate.id === "get-paragraph-pretty",
    )!;
    const semanticCase = semanticCaseFor(manifest, cliCase);
    const caseDirectory = join(judgeRoot, "repeated-value");
    mkdirSync(caseDirectory);
    const configPath = createFixtureConfig(repoRoot, semanticCase, caseDirectory);
    const observation = runBinary(fixtureBinary, [
      "get-paragraph", "--std-num", "9999", "--std-num", "1116", "--para-num", "23",
    ], configPath);
    const expected = expectedCliValue(repoRoot, manifest, cliCase);
    expect(inspectCliProcess(observation, expected, manifest)).toEqual([]);
  });

  test("uses the last repeated output mode", () => {
    const cliCase = cliSuccessCases.find((candidate) => candidate.id === "get-qna-summary")!;
    const semanticCase = semanticCaseFor(manifest, cliCase);
    const caseDirectory = join(judgeRoot, "repeated-output");
    mkdirSync(caseDirectory);
    const configPath = createFixtureConfig(repoRoot, semanticCase, caseDirectory);
    const observation = runBinary(fixtureBinary, [
      "get-qna", "--doc-number", "SSI-35629", "--output", "raw", "--output", "summary",
    ], configPath);
    expect(inspectCliProcess(
      observation,
      expectedCliValue(repoRoot, manifest, cliCase),
      manifest,
    )).toEqual([]);
  });

  test("keeps summary truncation valid at an astral-scalar boundary", () => {
    const cliCase = cliSuccessCases.find((candidate) => candidate.id === "get-qna-summary")!;
    const semanticCase = semanticCaseFor(manifest, cliCase);
    const route = semanticCase.routes[0]!;
    const payload = structuredClone(readConformanceJson(repoRoot, route.fixture)) as {
      facilityQna: { fullContent: string };
    };
    payload.facilityQna.fullContent = `${"a".repeat(999)}😀tail`;
    const caseDirectory = join(judgeRoot, "scalar-safe-summary");
    mkdirSync(caseDirectory);
    const configPath = join(caseDirectory, "config.json");
    writeFileSync(configPath, `${JSON.stringify({
      routes: [{ requestUrl: route.requestUrl, payload }],
      callsPath: join(caseDirectory, "calls.jsonl"),
    })}\n`);

    const observation = runBinary(fixtureBinary, cliCase.argv, configPath);
    expect(observation.exitCode).toBe(0);
    const value = JSON.parse(observation.stdout) as {
      result: { qna: { fullContentPreview: string } };
    };
    expect(value.result.qna.fullContentPreview).toBe(`${"a".repeat(999)}…`);
  });

  test("keeps the expected-value oracle on UTF-16 limits without splitting scalars", () => {
    expect(truncateUtf16Safely("a😀b", 2)).toBe("a…");
    expect(truncateUtf16Safely("a😀b", 3)).toBe("a😀…");
    expect(truncateUtf16Safely("a😀", 3)).toBe("a😀");
  });

  test.each([
    [
      ["search-standards", "--keyword", "-foo", "--limit", "0"],
      "limit",
      "--limit",
    ],
    [
      ["search-qna", "--keyword", "--pretty", "--types", "-1"],
      "types",
      "--types",
    ],
  ] as const)("consumes hyphen-leading values in %j", (argv, parameter, cliOption) => {
    const observation = runBinary(productionBinary, argv);
    const value = assertFailureProcess(observation);
    expect(value.failure).toMatchObject({
      code: "invalid_input",
      parameter,
      cliOption,
    });
    if (argv.includes("--pretty")) {
      expect(observation.stdout.split("\n").length).toBeGreaterThan(2);
    }
  });

  test.each([
    [["search-standards", "--limit", "1"], "keyword", "--keyword"],
    [["get-standard-structure", "--keyword", "리스"], "stdNum", "--std-num"],
    [["get-section", "--std-num", "1116"], "indexDocumentId", "--index-document-id"],
    [["get-paragraph", "--std-num", "1116"], "paraNum", "--para-num"],
    [["search-qna", "--limit", "5"], "keyword", "--keyword"],
    [["get-qna", "--keyword", "리스"], "docNumber", "--doc-number"],
  ] as const)("keeps %j capability validation in the SDK", (argv, parameter, option) => {
    const observation = runBinary(productionBinary, argv);
    const value = assertFailureProcess(observation);
    expect(value.failure).toMatchObject({
      code: "invalid_input",
      parameter,
      message: expect.stringContaining(option),
    });
  });

  test("preserves the get-section structure recovery action", () => {
    const value = assertFailureProcess(runBinary(productionBinary, [
      "get-section", "--std-num", "1019",
    ]));
    expect(value.failure.nextAction).toEqual({
      operation: "get-standard-structure",
      input: { stdNum: "1019" },
      command: "kasb get-standard-structure --std-num 1019 --output summary",
      reason: "get-section requires indexDocumentId or ref. get-standard-structure returns candidate sections and indexDocumentId/ref values for the standard.",
    });
    expect(value.metadata).toEqual({
      cliTransportVersion: "1",
      operation: "get-section",
    });
  });

  test("projects a committed malformed-source failure through the CLI", () => {
    const semanticCase = manifest.cases.find(
      (candidate) => candidate.id === "get-paragraph-source-changed",
    );
    if (semanticCase === undefined) throw new Error("Missing malformed paragraph case");
    const caseDirectory = join(judgeRoot, semanticCase.id);
    mkdirSync(caseDirectory);
    const configPath = createFixtureConfig(repoRoot, semanticCase, caseDirectory);
    const observation = runBinary(
      fixtureBinary,
      ["get-paragraph", "--std-num", "1116", "--para-num", "23"],
      configPath,
    );
    const value = assertFailureProcess(observation);
    const expected = readConformanceJson(repoRoot, semanticCase.expected) as {
      readonly error: Record<string, unknown>;
    };
    expect(value.failure).toEqual({ ...expected.error, recoverable: false });
    expect(value.metadata).toEqual({
      cliTransportVersion: "1",
      operation: "get-paragraph",
    });
    expect([...readRecordedCalls(join(caseDirectory, "calls.jsonl"))].sort()).toEqual(
      semanticCase.routes.map((route) => route.requestUrl).sort(),
    );
  });

  test("keeps integer parsing network-free and machine-readable", () => {
    const observation = runBinary(productionBinary, [
      "search-standards", "--keyword", "리스", "--limit", "1.5",
    ]);
    const value = assertFailureProcess(observation);
    expect(value.failure.code).toBe("invalid_input");
    expect(value.failure.message).toContain("1.5");
  });

  test("production artifacts exclude the fixture-only environment hook", () => {
    const argv = ["search-qna", "--keyword", "x", "--limit", "999"];
    const productionObservation = runBinary(
      productionBinary,
      argv,
      join(judgeRoot, "does-not-exist.json"),
    );
    const productionValue = assertFailureProcess(productionObservation);
    expect(productionValue.failure).toMatchObject({
      code: "invalid_input",
      parameter: "rows",
      cliOption: "--limit",
    });

    const fixtureValue = assertFailureProcess(runBinary(
      fixtureBinary,
      argv,
      join(judgeRoot, "does-not-exist.json"),
    ));
    expect(fixtureValue.failure).toEqual({
      code: "internal_failure",
      message: "Could not initialize the KASB transport.",
      recoverable: false,
      retryable: false,
    });
  });

  test("rejects deliberate process and payload controls before the real binary", () => {
    const cliCase = cliSuccessCases.find(
      (candidate) => candidate.id === "get-paragraph-pretty",
    )!;
    const expected = expectedCliValue(repoRoot, manifest, cliCase);
    const valid: CliProcessObservation = {
      exitCode: 0,
      signal: null,
      stdout: `${JSON.stringify(expected).replace("<normalized-fetched-at>", "2026-05-18T00:00:00.000Z")}\n`,
      stderr: "",
    };
    expect(inspectCliProcess(valid, expected, manifest)).toEqual([]);
    expect(inspectCliProcess({ ...valid, exitCode: 1 }, expected, manifest)).toContain("exit:1");
    expect(inspectCliProcess({ ...valid, stderr: "diagnostic" }, expected, manifest)).toContain("stderr:not-empty");
    expect(inspectCliProcess({ ...valid, stdout: valid.stdout.trimEnd() }, expected, manifest)).toContain("stdout:newline-contract");
    expect(inspectCliProcess({ ...valid, stdout: ` ${valid.stdout}` }, expected, manifest)).toContain("stdout:json-boundary-whitespace");
    expect(inspectCliProcess({ ...valid, stdout: `${valid.stdout.slice(0, -1)} \n` }, expected, manifest)).toContain("stdout:json-boundary-whitespace");

    const validFailure = {
      failure: { code: "invalid_input" },
      metadata: { cliTransportVersion: "1" },
      warnings: [],
    };
    expect(inspectCliFailureEnvelope(validFailure)).toEqual([]);
    expect(inspectCliFailureEnvelope({ ...validFailure, extra: true })).toContain(
      "failure-envelope:top-level-keys",
    );
    expect(inspectCliFailureEnvelope({ ...validFailure, warnings: [{ code: "wrong" }] })).toContain(
      "failure-envelope:warnings",
    );

    const changed = structuredClone(expected) as Record<string, unknown>;
    changed.warnings = [{ code: "deliberately_wrong" }];
    const failures = inspectCliProcess(
      { ...valid, stdout: `${JSON.stringify(changed)}\n` },
      expected,
      manifest,
    );
    expect(failures.some((failure) => failure.startsWith("json:"))).toBe(true);
  });

  if (process.platform !== "win32") {
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      test(`preserves OS-native ${signal} termination without JSON`, async () => {
        const cliCase = cliSuccessCases.find((candidate) => candidate.semanticCase === "get-qna-success")!;
        const semanticCase = semanticCaseFor(manifest, cliCase);
        const caseDirectory = join(judgeRoot, `signal-${signal}`);
        mkdirSync(caseDirectory);
        const readyPath = join(caseDirectory, "ready");
        const configPath = createFixtureConfig(repoRoot, semanticCase, caseDirectory, {
          pending: true,
          readyPath,
        });
        const processHandle = Bun.spawn({
          cmd: [fixtureBinary, ...cliCase.argv],
          cwd: repoRoot,
          env: { ...process.env, KASB_CLI_CONFORMANCE_CONFIG: configPath },
          stdout: "pipe",
          stderr: "pipe",
        });
        let exited = false;
        try {
          await waitForFile(readyPath);
          processHandle.kill(signal);
          await withTimeout(processHandle.exited, 5_000, `${signal} termination`);
          exited = true;
          const stdout = await new Response(processHandle.stdout).text();
          const stderr = await new Response(processHandle.stderr).text();
          expect(processHandle.signalCode).toBe(signal);
          expect(stdout).toBe("");
          expect(stderr).toBe("");
        } finally {
          if (!exited) {
            try {
              processHandle.kill("SIGKILL");
            } catch {
              // The process may have exited between the timeout and cleanup.
            }
            await Promise.race([processHandle.exited, Bun.sleep(1_000)]);
          }
        }
      });
    }
  }
});

const buildBinary = (targetDirectory: string, fixture: boolean): string => {
  const result = spawnSync("cargo", [
    "build", "--locked", "-p", "kasb-cli", "--target-dir", targetDirectory,
    ...(fixture ? ["--features", "conformance-fixtures"] : []),
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: buildTimeoutMs,
    killSignal: "SIGKILL",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error !== undefined) {
    throw new Error(`Could not run the Rust CLI judge build: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Could not build the Rust CLI judge binary:\n${result.stderr}`);
  }
  return join(targetDirectory, "debug", executableName);
};

const runBinary = (
  binary: string,
  argv: readonly string[],
  configPath?: string,
): CliProcessObservation => {
  const result = spawnSync(binary, argv, {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...(configPath === undefined ? {} : { KASB_CLI_CONFORMANCE_CONFIG: configPath }),
    },
    encoding: "utf8",
    timeout: processTimeoutMs,
    killSignal: "SIGKILL",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error !== undefined) {
    throw new Error(`Could not run the Rust CLI judge binary: ${result.error.message}`);
  }
  return {
    exitCode: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

const assertFailureProcess = (observation: CliProcessObservation): {
  failure: Record<string, unknown>;
  metadata: Record<string, unknown>;
} => {
  expect(observation.exitCode).toBe(1);
  expect(observation.signal).toBeNull();
  expect(observation.stderr).toBe("");
  expect(inspectCliJsonFraming(observation.stdout)).toEqual([]);
  const value = JSON.parse(observation.stdout) as {
    failure: Record<string, unknown>;
    metadata: Record<string, unknown>;
    warnings: unknown[];
  };
  expect(inspectCliFailureEnvelope(value)).toEqual([]);
  return value;
};

const waitForFile = async (path: string): Promise<void> => {
  const deadline = Date.now() + 5_000;
  while (!existsSync(path)) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for fixture readiness: ${path}`);
    await Bun.sleep(10);
  }
};

const withTimeout = async <Value>(
  promise: Promise<Value>,
  timeoutMs: number,
  label: string,
): Promise<Value> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
};
