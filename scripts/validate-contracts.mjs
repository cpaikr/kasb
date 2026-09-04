import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Validator } from "@seriousme/openapi-schema-validator";
import Ajv2020 from "ajv/dist/2020.js";
import { parseDocument } from "yaml";

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};
const equal = (actual, expected, message) =>
  check(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
  );
const readText = (path) => readFile(new URL(path, import.meta.url), "utf8");

const openapiText = await readText("../contracts/kasb/openapi.yaml");
const schemaValidation = await new Validator().validate(openapiText);
if (!schemaValidation.valid) {
  const errors = typeof schemaValidation.errors === "string"
    ? [schemaValidation.errors]
    : schemaValidation.errors;
  for (const error of errors || []) {
    failures.push(`OpenAPI 3.1 schema: ${error.instancePath || "/"} ${error.message || String(error)}`);
  }
}
const parsed = parseDocument(openapiText, { prettyErrors: true, strict: true, uniqueKeys: true });
for (const error of parsed.errors) failures.push(`OpenAPI YAML: ${error.message}`);
const contract = parsed.toJS();

check(contract?.openapi === "3.1.0", "OpenAPI contract must declare version 3.1.0");
equal(
  contract?.servers,
  [{ url: "https://db.kasb.or.kr/api", description: "Observed public KASB JSON API origin" }],
  "OpenAPI must allow exactly one KASB API origin",
);
check(
  contract?.["x-kasb-authority"]?.role === "sole-external-http-wire-authority",
  "OpenAPI must declare its sole wire-authority role",
);

const expectedPaths = [
  "/standard",
  "/standard-indexes/{stdNum}",
  "/standard-indexes/{stdNum}/searchWord",
  "/paragraphs/{stdNum}/{indexDocumentId}",
  "/paragraphs/content/{stdNum}/{paraNum}",
  "/qnas/v2",
  "/qnas/v2/{docNumber}",
];
const operationByPath = new Map(expectedPaths.map((path) => [
  path,
  contract?.paths?.[path]?.get?.operationId,
]));
equal(Object.keys(contract?.paths || {}), expectedPaths, "OpenAPI paths must remain narrow and ordered");
for (const path of expectedPaths) {
  equal(Object.keys(contract?.paths?.[path] || {}), ["get"], `${path} must support GET only`);
  equal(Object.keys(contract?.paths?.[path]?.get?.responses || {}), ["2XX", "default"], `${path} must distinguish successful HTTP responses from transport failures`);
}

const profile = contract?.["x-kasb-json-profile"];
check(profile?.response?.mediaType === "application/json", "KASB responses must remain JSON");
check(profile?.transport?.successStatuses === "200-299", "successful HTTP statuses must remain 200-299");
check(profile?.transport?.requestDeadlineMilliseconds === 15_000, "request deadline must remain 15 seconds");
check(profile?.transport?.connectDeadlineMilliseconds === 10_000, "connect deadline must remain 10 seconds");
check(profile?.transport?.automaticRetries === 0, "automatic retries must remain disabled");
check(profile?.transport?.maxInFlightPerClient === 8, "per-client concurrency must remain bounded at eight");
equal(profile?.transport?.retryableStatuses, [429], "HTTP 429 must remain explicitly retryable");
equal(profile?.transport?.retryableStatusClasses, ["5XX"], "every HTTP 5xx status must remain retryable");

const evidence = JSON.parse(await readText("../conformance/v1/cases.json"));
check(!("paths" in evidence) && !("transport" in evidence), "conformance evidence must not become a second wire authority");

const fixtureManifest = JSON.parse(await readText("../fixtures/kasb/manifest.json"));
check(fixtureManifest.schemaVersion === 1, "fixture manifest schemaVersion must be 1");
check(fixtureManifest.authority === "independent-provider-evidence", "fixtures must identify as independent evidence");
const seenFixtures = new Set();
const coveredOperations = new Set();
const responseValidatorByOperation = new Map();
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
const responseSchemaFor = (operationId) => {
  const entry = [...operationByPath.entries()].find(([, candidate]) => candidate === operationId);
  const path = entry?.[0];
  return path === undefined
    ? undefined
    : contract?.paths?.[path]?.get?.responses?.["2XX"]?.content?.["application/json"]?.schema;
};
const replaceComponentRefs = (value) => {
  if (Array.isArray(value)) return value.map(replaceComponentRefs);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    key === "$ref" && typeof item === "string"
      ? item.replace("#/components/schemas/", "#/$defs/")
      : replaceComponentRefs(item),
  ]));
};
const responseValidatorFor = (operationId) => {
  if (responseValidatorByOperation.has(operationId)) return responseValidatorByOperation.get(operationId);
  const responseSchema = responseSchemaFor(operationId);
  check(responseSchema !== undefined, `${operationId} must declare a JSON response schema`);
  if (responseSchema === undefined) return undefined;
  const schema = replaceComponentRefs({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...responseSchema,
    $defs: contract?.components?.schemas ?? {},
  });
  let validator;
  try {
    validator = ajv.compile(schema);
  } catch (error) {
    failures.push(`${operationId} response schema could not be compiled: ${error.message}`);
    return undefined;
  }
  responseValidatorByOperation.set(operationId, validator);
  return validator;
};
const templateForUrl = (rawUrl) => {
  const url = new URL(rawUrl);
  check(url.origin === "https://db.kasb.or.kr", `fixture route uses an undeclared origin: ${rawUrl}`);
  check(url.pathname.startsWith("/api/"), `fixture route must use the exact /api base path: ${rawUrl}`);
  const pathname = url.pathname.startsWith("/api/") ? url.pathname.slice(4) : url.pathname;
  return expectedPaths.find((template) => {
    const expression = new RegExp(`^${template.replace(/\{[^}]+\}/g, "[^/]+")}$`);
    return expression.test(pathname);
  });
};
const validateFixtureRequest = (template, rawUrl, fixture) => {
  if (template === undefined) return;
  const operation = contract?.paths?.[template]?.get;
  if (operation === undefined) {
    check(false, `${fixture} route is missing its GET operation`);
    return;
  }
  const parameters = (operation.parameters ?? []).map((parameter) => {
    if (parameter?.$ref === undefined) return parameter;
    const name = parameter.$ref.replace("#/components/parameters/", "");
    const resolved = contract?.components?.parameters?.[name];
    check(resolved !== undefined, `${fixture} contains an unresolved parameter reference ${parameter.$ref}`);
    return resolved;
  }).filter(Boolean);
  const queryParameters = parameters.filter((parameter) => parameter?.in === "query");
  const url = new URL(rawUrl);
  const actualNames = [...url.searchParams.keys()];
  check(new Set(actualNames).size === actualNames.length, `${fixture} must not repeat query parameters`);
  const expectedNames = queryParameters
    .map((parameter) => parameter.name)
    .filter((name) => url.searchParams.has(name));
  equal(actualNames, expectedNames, `${fixture} query parameters must match OpenAPI names and order`);
  for (const parameter of queryParameters) {
    const value = url.searchParams.get(parameter.name);
    if (parameter.required) check(value !== null, `${fixture} is missing required query parameter ${parameter.name}`);
    if (value === null) continue;
    const schema = parameter.schema ?? {};
    if (schema.type === "integer") {
      check(/^\d+$/.test(value) && Number(value) >= schema.minimum, `${fixture} query parameter ${parameter.name} violates its integer schema`);
    }
    if (schema.minLength !== undefined) {
      check(value.length >= schema.minLength, `${fixture} query parameter ${parameter.name} is too short`);
    }
    if (schema.pattern !== undefined) {
      check(new RegExp(schema.pattern).test(value), `${fixture} query parameter ${parameter.name} violates its pattern`);
    }
  }
};
for (const entry of fixtureManifest.entries || []) {
  check(entry.method === "GET", `${entry.fixture} must use GET`);
  check(!seenFixtures.has(entry.fixture), `${entry.fixture} is duplicated in the fixture manifest`);
  seenFixtures.add(entry.fixture);
  const template = templateForUrl(entry.requestUrl);
  check(template !== undefined, `${entry.fixture} route is not declared by OpenAPI`);
  validateFixtureRequest(template, entry.requestUrl, entry.fixture);
  const operationId = operationByPath.get(template);
  check(entry.operationId === operationId, `${entry.fixture} operationId must match ${operationId}`);
  coveredOperations.add(operationId);
  const bytes = await readFile(new URL(`../${entry.fixture}`, import.meta.url));
  const checksum = createHash("sha256").update(bytes).digest("hex");
  check(checksum === entry.sha256, `${entry.fixture} checksum drifted; update evidence only through review`);
  const value = JSON.parse(bytes);
  const validateResponse = responseValidatorFor(operationId);
  if (validateResponse !== undefined && !validateResponse(value)) {
    failures.push(`${entry.fixture} violates the ${operationId} OpenAPI response schema: ${ajv.errorsText(validateResponse.errors, { separator: "; " })}`);
  }
}
const fixtureFiles = (await readdir(new URL("../fixtures/kasb/", import.meta.url)))
  .filter((name) => name.endsWith(".json") && name !== "manifest.json")
  .map((name) => `fixtures/kasb/${name}`)
  .sort();
equal([...seenFixtures].sort(), fixtureFiles, "fixture manifest must list every captured KASB fixture exactly once");
equal([...coveredOperations].sort(), [...new Set(operationByPath.values())].sort(), "fixture evidence must cover every OpenAPI operation");
for (const testCase of evidence.cases || []) {
  for (const route of testCase.routes || []) {
    if (route.fixture.startsWith("conformance/v1/source-controls/")) {
      const template = templateForUrl(route.requestUrl);
      check(template !== undefined, `${testCase.id} source-control route must be declared by OpenAPI`);
      validateFixtureRequest(template, route.requestUrl, route.fixture);
      const operationId = operationByPath.get(template);
      const value = JSON.parse(await readFile(new URL(`../${route.fixture}`, import.meta.url), "utf8"));
      const validateResponse = responseValidatorFor(operationId);
      const isValid = validateResponse?.(value) === true;
      check(
        route.responseSchemaValidity === "valid" || route.responseSchemaValidity === "invalid",
        `${testCase.id} source control must declare responseSchemaValidity`,
      );
      check(
        isValid === (route.responseSchemaValidity === "valid"),
        `${route.fixture} must be OpenAPI ${route.responseSchemaValidity}; ${ajv.errorsText(validateResponse?.errors, { separator: "; " })}`,
      );
      continue;
    }
    const matching = fixtureManifest.entries?.find((entry) =>
      entry.fixture === route.fixture && entry.requestUrl === route.requestUrl
    );
    check(matching !== undefined, `${testCase.id} route must match the fixture manifest exactly`);
  }
}

for (const relativePath of [
  "../README.md",
  "../VISION.md",
  "../docs/specs/kasb-standards-v1.md",
  "../packages/node/README.md",
]) {
  const text = await readText(relativePath);
  for (const path of [
    "/standard-indexes/{stdNum}/searchWord",
    "/paragraphs/content/{stdNum}/{paraNum}",
  ]) {
    check(!text.includes(path), `${relativePath} must link OpenAPI instead of restating wire template ${path}`);
  }
}

const targets = JSON.parse(await readText("../native-targets.json"));
check(targets.schemaVersion === 1, "native target manifest schemaVersion must be 1");
check(targets.supportClaim === "supported", "validated native targets must carry the supported claim");
check(targets.minimumNodeVersion === "20.18.1", "native planning must preserve the current Node floor");
check(targets.minimumGlibcVersion === "2.28", "GNU/Linux native artifacts must use the approved glibc 2.28 floor");
equal(
  targets.targets?.map(({ rustTarget }) => rustTarget),
  [
    "x86_64-unknown-linux-gnu",
    "aarch64-unknown-linux-gnu",
    "aarch64-apple-darwin",
    "x86_64-pc-windows-msvc",
  ],
  "supported native target matrix must remain explicit",
);
equal(
  targets.targets?.filter(({ continuousIntegration }) => continuousIntegration === true).map(({ rustTarget }) => rustTarget),
  ["x86_64-unknown-linux-gnu", "aarch64-unknown-linux-gnu"],
  "continuous native CI must cover exactly the two Linux GNU targets",
);
equal(
  targets.targets?.filter(({ continuousIntegration }) => continuousIntegration === false).map(({ rustTarget }) => rustTarget),
  ["aarch64-apple-darwin", "x86_64-pc-windows-msvc"],
  "macOS ARM64 and Windows x64 must remain explicit supported targets omitted from continuous CI",
);
check(
  new Set(targets.targets?.map(({ packageName }) => packageName)).size === targets.targets?.length,
  "every native target must have a unique package",
);
check(
  new Set(targets.targets?.map((target) => [target.npmPlatform, target.npmArch, target.libc || ""].join("-"))).size === targets.targets?.length,
  "every native target must have a unique runtime key",
);
for (const target of targets.targets || []) {
  check(typeof target.continuousIntegration === "boolean", `${target.rustTarget} must declare continuousIntegration`);
  check(target.packageName?.startsWith("@sjunepark/kasb-"), `${target.rustTarget} package must use the KASB scope`);
  check(target.addonFile?.endsWith(".node"), `${target.rustTarget} must name a Node-API artifact`);
  check(target.cliFile === (target.npmPlatform === "win32" ? "kasb.exe" : "kasb"), `${target.rustTarget} must name the native CLI consistently`);
  if (target.libc === "glibc") {
    const expectedRunner = target.npmArch === "arm64" ? "ubuntu-24.04-arm" : "ubuntu-24.04";
    check(target.runner === expectedRunner, `${target.rustTarget} continuous CI must use its GitHub-hosted Linux runner`);
    check(
      typeof target.buildContainer === "string" &&
        target.buildContainer.includes("manylinux_2_28") &&
        /@sha256:[0-9a-f]{64}$/u.test(target.buildContainer),
      `${target.rustTarget} must use a digest-pinned manylinux_2_28 build container`,
    );
  } else {
    check(!Object.hasOwn(target, "runner"), `${target.rustTarget} omitted from continuous CI must not declare a runner`);
    check(!Object.hasOwn(target, "buildContainer"), `${target.rustTarget} must not declare a Linux build container`);
  }
}

const canonicalPackage = JSON.parse(await readText("../packages/node/package.json"));
check(canonicalPackage.name === "@sjunepark/kasb", "packages/node must own the canonical npm identity");
check(canonicalPackage.private !== true, "the canonical npm package must not be private");
check(canonicalPackage.publishConfig?.access === "public", "the canonical npm package must declare public scoped-package access");
equal(Object.keys(canonicalPackage.bin ?? {}), ["kasb"], "the canonical package must expose only the kasb launcher");
equal(Object.keys(canonicalPackage.exports ?? {}), [".", "./toolset", "./package.json"], "the canonical package export surface must stay narrow");
check(!Object.hasOwn(canonicalPackage, "pi"), "the canonical package must not carry Pi registration metadata");
const workspaceEntries = await readdir(new URL("../packages/", import.meta.url), { withFileTypes: true });
check(!workspaceEntries.some((entry) => entry.name === "kasb-ts"), "the superseded TypeScript package must be absent after cutover");
for (const target of targets.targets || []) {
  const nativePackage = JSON.parse(await readText(`../${targets.nativePackageRoot}/${target.packageDirectory}/package.json`));
  check(nativePackage.name === target.packageName, `${target.rustTarget} must use its declared package identity`);
  check(nativePackage.private !== true, `${target.packageName} must not be private`);
  check(nativePackage.publishConfig?.access === "public", `${target.packageName} must declare public scoped-package access`);
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("KASB wire authority, evidence boundary, and supported native matrix are valid");
