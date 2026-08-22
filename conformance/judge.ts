import { readFileSync } from "node:fs";
import { join } from "node:path";

export type ConformanceOperationName =
  | "search-standards"
  | "get-standard-structure"
  | "get-section"
  | "get-paragraph"
  | "search-qna"
  | "get-qna";

export type ConformanceRoute = {
  readonly requestUrl: string;
  readonly fixture: string;
};

export type ConformanceCase = {
  readonly id: string;
  readonly operation: ConformanceOperationName;
  readonly input: Record<string, unknown>;
  readonly routes: readonly ConformanceRoute[];
  readonly expected: string;
};

export type ConformanceManifest = {
  readonly schemaVersion: 1;
  readonly contractVersion: "kasb-standards-v1";
  readonly canonicalization: {
    readonly replaceWithToken: readonly string[];
    readonly token: string;
  };
  readonly cases: readonly ConformanceCase[];
};

export type DifferenceKind = "type" | "value" | "missing-key" | "array-length";

export type ConformanceDifference = {
  readonly kind: DifferenceKind;
  readonly path: string;
  readonly expected: unknown;
  readonly actual: unknown;
};

export type ConformanceRunnerRequest = {
  readonly protocolVersion: 1;
  readonly caseId: string;
  readonly operation: ConformanceOperationName;
  readonly input: Record<string, unknown>;
  readonly routes: readonly {
    readonly requestUrl: string;
    readonly payload: unknown;
  }[];
};

export type ConformanceRunner = {
  readonly name: string;
  readonly command: readonly string[];
  readonly cwd: string;
  readonly timeoutMs?: number;
};

export type KnownBadManifest = {
  readonly schemaVersion: 1;
  readonly cases: readonly {
    readonly id: string;
    readonly baselineCase: string;
    readonly actual: string;
    readonly expectedDifference: DifferenceKind;
    readonly expectedPath: string;
  }[];
};

const readJson = <T>(repoRoot: string, path: string): T =>
  JSON.parse(readFileSync(join(repoRoot, path), "utf8")) as T;

export const readConformanceManifest = (repoRoot: string): ConformanceManifest =>
  readJson<ConformanceManifest>(repoRoot, "conformance/v1/cases.json");

export const readKnownBadManifest = (repoRoot: string): KnownBadManifest =>
  readJson<KnownBadManifest>(repoRoot, "conformance/v1/known-bad.json");

export const readConformanceJson = (repoRoot: string, path: string): unknown =>
  readJson<unknown>(repoRoot, path);

export const serializeConformanceOutcome = (value: unknown): unknown => {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Conformance outcomes must serialize to a JSON value");
  }
  return JSON.parse(serialized) as unknown;
};

const canonicalizeAtPath = (
  value: unknown,
  path: string,
  replacePaths: ReadonlySet<string>,
  token: string,
): unknown => {
  if (replacePaths.has(path)) return token;
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalizeAtPath(item, `${path}[${index}]`, replacePaths, token));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalizeAtPath(item, `${path}.${key}`, replacePaths, token)]),
    );
  }
  return value;
};

export const canonicalizeConformanceOutcome = (
  value: unknown,
  manifest: ConformanceManifest,
): unknown => canonicalizeAtPath(
  serializeConformanceOutcome(value),
  "$",
  new Set(manifest.canonicalization.replaceWithToken),
  manifest.canonicalization.token,
);

const typeOfJson = (value: unknown): string =>
  value === null ? "null" : Array.isArray(value) ? "array" : typeof value;

export const findConformanceDifference = (
  expected: unknown,
  actual: unknown,
  path = "$",
): ConformanceDifference | undefined => {
  const expectedType = typeOfJson(expected);
  const actualType = typeOfJson(actual);
  if (expectedType !== actualType) {
    return { kind: "type", path, expected, actual };
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      return { kind: "array-length", path, expected: expected.length, actual: actual.length };
    }
    for (let index = 0; index < expected.length; index += 1) {
      const difference = findConformanceDifference(expected[index], actual[index], `${path}[${index}]`);
      if (difference !== undefined) return difference;
    }
    return undefined;
  }

  if (expected !== null && actual !== null && expectedType === "object") {
    const expectedRecord = expected as Record<string, unknown>;
    const actualRecord = actual as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(expectedRecord), ...Object.keys(actualRecord)])].sort();
    for (const key of keys) {
      if (!(key in expectedRecord) || !(key in actualRecord)) {
        return {
          kind: "missing-key",
          path: `${path}.${key}`,
          expected: expectedRecord[key],
          actual: actualRecord[key],
        };
      }
      const difference = findConformanceDifference(expectedRecord[key], actualRecord[key], `${path}.${key}`);
      if (difference !== undefined) return difference;
    }
    return undefined;
  }

  return Object.is(expected, actual)
    ? undefined
    : { kind: "value", path, expected, actual };
};

const materializeRunnerRequest = (
  repoRoot: string,
  testCase: ConformanceCase,
): ConformanceRunnerRequest => ({
  protocolVersion: 1,
  caseId: testCase.id,
  operation: testCase.operation,
  input: testCase.input,
  routes: testCase.routes.map((route) => ({
    requestUrl: route.requestUrl,
    payload: readConformanceJson(repoRoot, route.fixture),
  })),
});

const assertRunnerOutcome = (runnerName: string, caseId: string, value: unknown): void => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${runnerName} returned a non-object outcome for ${caseId}`);
  }
  const record = value as Record<string, unknown>;
  if (record.ok === true) {
    if (!("value" in record) || "error" in record) {
      throw new Error(`${runnerName} returned an invalid success outcome for ${caseId}`);
    }
    return;
  }
  if (record.ok === false) {
    if (!("error" in record) || "value" in record) {
      throw new Error(`${runnerName} returned an invalid failure outcome for ${caseId}`);
    }
    return;
  }
  throw new Error(`${runnerName} returned an outcome without a boolean ok field for ${caseId}`);
};

export const executeConformanceRunner = async (
  repoRoot: string,
  runner: ConformanceRunner,
  testCase: ConformanceCase,
): Promise<unknown> => {
  const subprocess = Bun.spawn({
    cmd: [...runner.command],
    cwd: runner.cwd,
    env: process.env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  subprocess.stdin.write(`${JSON.stringify(materializeRunnerRequest(repoRoot, testCase))}\n`);
  subprocess.stdin.end();

  const timeoutMs = runner.timeoutMs ?? 30_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      subprocess.kill();
      reject(new Error(`${runner.name} timed out after ${timeoutMs}ms for ${testCase.id}`));
    }, timeoutMs);
  });

  try {
    const [stdout, stderr, exitCode] = await Promise.race([
      Promise.all([
        new Response(subprocess.stdout).text(),
        new Response(subprocess.stderr).text(),
        subprocess.exited,
      ]),
      timedOut,
    ]);
    if (exitCode !== 0) {
      throw new Error(
        `${runner.name} exited ${exitCode} for ${testCase.id}${stderr.length === 0 ? "" : `: ${stderr.trim()}`}`,
      );
    }
    if (stderr.length !== 0) {
      throw new Error(`${runner.name} wrote unexpected stderr for ${testCase.id}: ${stderr.trim()}`);
    }

    let outcome: unknown;
    try {
      outcome = JSON.parse(stdout) as unknown;
    } catch (error) {
      throw new Error(`${runner.name} returned invalid JSON for ${testCase.id}`, { cause: error });
    }
    assertRunnerOutcome(runner.name, testCase.id, outcome);
    return outcome;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

export const judgeConformanceCase = async (
  repoRoot: string,
  manifest: ConformanceManifest,
  runner: ConformanceRunner,
  testCase: ConformanceCase,
): Promise<ConformanceDifference | undefined> => {
  const actual = canonicalizeConformanceOutcome(
    await executeConformanceRunner(repoRoot, runner, testCase),
    manifest,
  );
  return findConformanceDifference(
    readConformanceJson(repoRoot, testCase.expected),
    actual,
  );
};

export const judgeKnownBadControls = (
  repoRoot: string,
  manifest: ConformanceManifest,
  knownBad: KnownBadManifest,
): readonly string[] => {
  const failures: string[] = [];
  for (const knownBadCase of knownBad.cases) {
    const baseline = manifest.cases.find((testCase) => testCase.id === knownBadCase.baselineCase);
    if (baseline === undefined) {
      failures.push(`${knownBadCase.id}: unknown baseline ${knownBadCase.baselineCase}`);
      continue;
    }
    const difference = findConformanceDifference(
      readConformanceJson(repoRoot, baseline.expected),
      canonicalizeConformanceOutcome(
        readConformanceJson(repoRoot, knownBadCase.actual),
        manifest,
      ),
    );
    if (
      difference?.kind !== knownBadCase.expectedDifference
      || difference.path !== knownBadCase.expectedPath
    ) {
      failures.push(
        `${knownBadCase.id}: expected ${knownBadCase.expectedDifference} at ${knownBadCase.expectedPath}, got ${difference?.kind ?? "no difference"} at ${difference?.path ?? "$"}`,
      );
    }
  }
  return failures;
};
