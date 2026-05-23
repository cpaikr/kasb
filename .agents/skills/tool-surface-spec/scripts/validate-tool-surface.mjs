#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const requiredPiActions = ["help", "command_help", "validate", "run"];

const parseArgs = (argv) => {
  const result = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }

    if (arg === "--run-cli") {
      result.runCli = true;
      continue;
    }

    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[index + 1];

      if (value === undefined || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }

      result[key] = value;
      index += 1;
      continue;
    }

    result._.push(arg);
  }

  return result;
};

const usage = () => `Usage:
  node validate-tool-surface.mjs [package-dir] [options]

Options:
  --id <id>                         Expected toolset id / Pi tool name.
  --toolset-factory <exportName>     Explicit ./toolset factory export.
  --pi-factory <exportName>          Explicit ./pi factory export.
  --run-cli                          Run CLI --help and invalid-command smoke checks.
  -h, --help                         Show this help.
`;

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasString = (value, key) =>
  isRecord(value) && typeof value[key] === "string";

const hasFunction = (value, key) =>
  isRecord(value) && typeof value[key] === "function";

const isKebabCaseOperationName = (value) =>
  typeof value === "string" && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value);

const descriptionHowToCuePatterns = [
  /\b(?:action|command)\s*[:=]/i,
  /\bcommand_help\b/i,
  /\binputJson\b/i,
  /\bwith\s+action\b/i,
  /\b(?:use|call|invoke|execute|run)\s+(?:this\s+)?(?:tool\s+)?(?:with|using)\b/i,
];

const hasHowToDescriptionCue = (value) =>
  typeof value === "string" &&
  descriptionHowToCuePatterns.some((pattern) => pattern.test(value));

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const createReporter = () => {
  const passes = [];
  const warnings = [];
  const failures = [];

  return {
    pass(message) {
      passes.push(message);
    },
    warn(message) {
      warnings.push(message);
    },
    fail(message) {
      failures.push(message);
    },
    check(condition, message) {
      if (condition) {
        passes.push(message);
      } else {
        failures.push(message);
      }
    },
    print() {
      console.log("# Tool surface validation\n");

      if (passes.length > 0) {
        console.log("## Passes");
        for (const message of passes) console.log(`- ${message}`);
        console.log();
      }

      if (warnings.length > 0) {
        console.log("## Warnings");
        for (const message of warnings) console.log(`- ${message}`);
        console.log();
      }

      if (failures.length > 0) {
        console.log("## Failures");
        for (const message of failures) console.log(`- ${message}`);
        console.log();
      }

      console.log(
        failures.length === 0
          ? "Result: PASS"
          : `Result: FAIL (${failures.length} failure${failures.length === 1 ? "" : "s"})`,
      );
    },
    get failed() {
      return failures.length > 0;
    },
  };
};

const getExportEntry = (pkg, subpath) => {
  if (!isRecord(pkg.exports)) return undefined;
  return pkg.exports[subpath];
};

const getImportTarget = (entry) => {
  if (typeof entry === "string") return entry;
  if (!isRecord(entry)) return undefined;
  if (typeof entry.import === "string") return entry.import;
  if (typeof entry.default === "string") return entry.default;
  return undefined;
};

const resolvePackageTarget = (root, target) => {
  if (typeof target !== "string") return undefined;
  return resolve(root, target);
};

const importPackageTarget = async (path) => import(pathToFileURL(path).href);

const detectFactory = (module, explicitName, pattern) => {
  if (explicitName !== undefined) {
    return typeof module[explicitName] === "function"
      ? { name: explicitName, factory: module[explicitName] }
      : undefined;
  }

  const candidates = Object.entries(module).filter(
    ([name, value]) => pattern.test(name) && typeof value === "function",
  );

  if (candidates.length !== 1) return undefined;

  const [[name, factory]] = candidates;
  return { name, factory };
};

const getBinEntries = (pkg) => {
  if (typeof pkg.bin === "string") {
    return [[pkg.name ?? "cli", pkg.bin]];
  }

  if (isRecord(pkg.bin)) {
    return Object.entries(pkg.bin).filter(
      ([, value]) => typeof value === "string",
    );
  }

  return [];
};

const expectValidationFailureShape = (reporter, value, label) => {
  reporter.check(isRecord(value), `${label} returns an object`);
  if (!isRecord(value)) return;

  reporter.check(value.ok === false, `${label} has ok:false`);
  reporter.check(isRecord(value.error), `${label} includes error object`);

  if (isRecord(value.error)) {
    reporter.check(
      typeof value.error.code === "string",
      `${label} error has code`,
    );
    reporter.check(
      typeof value.error.message === "string",
      `${label} error has message`,
    );
    reporter.check(
      typeof value.error.retryable === "boolean",
      `${label} error has retryable flag`,
    );

    if (value.error.retryable === true) {
      reporter.check(
        isRecord(value.error.recoveryAction) ||
          typeof value.error.recoveryHint === "string",
        `${label} retryable error has recovery metadata`,
      );
    }
  }
};

const expectPiToolResultShape = (reporter, value, label) => {
  reporter.check(isRecord(value), `${label} returns object`);
  if (!isRecord(value)) return undefined;

  reporter.check(Array.isArray(value.content), `${label} has content array`);
  if (Array.isArray(value.content)) {
    reporter.check(
      value.content.every(
        (item) =>
          isRecord(item) && item.type === "text" && typeof item.text === "string",
      ),
      `${label} content entries are text blocks`,
    );
  }

  reporter.check(isRecord(value.details), `${label} preserves details object`);
  return isRecord(value.details) ? value.details : undefined;
};

const expectPiActionDetailsShape = (reporter, details, label, expected) => {
  reporter.check(isRecord(details), `${label} is object`);
  if (!isRecord(details)) return;

  reporter.check(details.ok === expected.ok, `${label} has ok:${expected.ok}`);
  reporter.check(
    details.action === expected.action,
    `${label} action is ${expected.action}`,
  );

  if (expected.command !== undefined) {
    reporter.check(
      details.command === expected.command,
      `${label} command is ${expected.command}`,
    );
  }

  if (expected.field !== undefined) {
    reporter.check(expected.field in details, `${label} includes ${expected.field}`);
  }

  if (expected.ok === false) {
    reporter.check(isRecord(details.error), `${label} includes error object`);
    if (isRecord(details.error)) {
      reporter.check(
        typeof details.error.message === "string",
        `${label} error has message`,
      );
    }
  }
};

const validateOperationSpec = (reporter, spec, name) => {
  reporter.check(isRecord(spec), `operation ${name} help returns an object`);
  if (!isRecord(spec)) return;

  reporter.check(spec.name === name, `operation ${name} help preserves name`);
  reporter.check(
    isKebabCaseOperationName(spec.name),
    `operation ${name} uses kebab-case canonical name`,
  );
  reporter.check(typeof spec.label === "string", `operation ${name} has label`);
  reporter.check(
    typeof spec.description === "string",
    `operation ${name} has description`,
  );
  reporter.check(
    isRecord(spec.inputJsonSchema),
    `operation ${name} has object inputJsonSchema`,
  );
  reporter.check(
    isRecord(spec.resultJsonSchema),
    `operation ${name} has object resultJsonSchema`,
  );
  reporter.check(
    Array.isArray(spec.requiredInputKeys),
    `operation ${name} has requiredInputKeys array`,
  );
  reporter.check(
    Array.isArray(spec.examples),
    `operation ${name} has examples array`,
  );
  reporter.check(
    Array.isArray(spec.limitations),
    `operation ${name} has limitations array`,
  );
  reporter.check(
    typeof spec.resultSummary === "string",
    `operation ${name} has resultSummary`,
  );
};

const validateToolset = async (reporter, toolsetModule, args) => {
  const detected = detectFactory(
    toolsetModule,
    args["toolset-factory"],
    /^create[A-Z].*Toolset$/,
  );

  reporter.check(
    detected !== undefined,
    args["toolset-factory"] === undefined
      ? "./toolset has exactly one create*Toolset factory export"
      : `./toolset exports ${args["toolset-factory"]}`,
  );

  if (detected === undefined) return undefined;

  const toolset = await detected.factory();
  reporter.pass(`loaded neutral toolset via ${detected.name}()`);

  reporter.check(hasString(toolset, "id"), "toolset has id string");
  reporter.check(hasString(toolset, "label"), "toolset has label string");
  reporter.check(
    hasString(toolset, "description"),
    "toolset has description string",
  );
  if (hasString(toolset, "description")) {
    reporter.check(
      !hasHowToDescriptionCue(toolset.description),
      "top-level toolset description is purpose-only, not usage instructions",
    );
  }

  if (args.id !== undefined && hasString(toolset, "id")) {
    reporter.check(toolset.id === args.id, `toolset id is ${args.id}`);
  }

  for (const method of [
    "help",
    "listOperations",
    "getCommandHelp",
    "validateInput",
    "execute",
    "serializeError",
  ]) {
    reporter.check(hasFunction(toolset, method), `toolset has ${method}()`);
  }

  if (
    !hasFunction(toolset, "help") ||
    !hasFunction(toolset, "listOperations")
  ) {
    return toolset;
  }

  const help = toolset.help();
  reporter.check(isRecord(help), "toolset help() returns an object");
  reporter.check(hasString(help, "id"), "toolset help has id");
  reporter.check(
    Array.isArray(help.operations),
    "toolset help has operations array",
  );

  const operations = toolset.listOperations();
  reporter.check(
    Array.isArray(operations),
    "listOperations() returns an array",
  );
  reporter.check(
    operations.length > 0,
    "listOperations() returns at least one operation",
  );

  if (!Array.isArray(operations)) return toolset;

  for (const operation of operations) {
    reporter.check(isRecord(operation), "operation summary is an object");
    if (!isRecord(operation)) continue;

    reporter.check(
      typeof operation.name === "string" && operation.name.length > 0,
      "operation summary has name",
    );
    reporter.check(
      isKebabCaseOperationName(operation.name),
      `operation ${operation.name ?? "<unknown>"} summary name is kebab-case`,
    );
    reporter.check(
      typeof operation.label === "string" && operation.label.length > 0,
      `operation ${operation.name ?? "<unknown>"} has label`,
    );
    reporter.check(
      typeof operation.description === "string" &&
        operation.description.length > 0,
      `operation ${operation.name ?? "<unknown>"} has description`,
    );

    if (
      typeof operation.name !== "string" ||
      !hasFunction(toolset, "getCommandHelp")
    ) {
      continue;
    }

    const spec = toolset.getCommandHelp(operation.name);
    validateOperationSpec(reporter, spec, operation.name);

    if (
      isRecord(spec) &&
      Array.isArray(spec.examples) &&
      spec.examples.length > 0 &&
      hasFunction(toolset, "validateInput")
    ) {
      const validation = toolset.validateInput(
        operation.name,
        spec.examples[0],
      );
      reporter.check(
        isRecord(validation) &&
          validation.ok === true &&
          isRecord(validation.input),
        `operation ${operation.name} first example validates`,
      );
    }
  }

  if (hasFunction(toolset, "validateInput")) {
    expectValidationFailureShape(
      reporter,
      toolset.validateInput("__validate_tool_surface_unknown__", {}),
      "unknown operation validation",
    );
  }

  if (hasFunction(toolset, "serializeError")) {
    const serialized = toolset.serializeError(new Error("validation smoke"));
    reporter.check(isRecord(serialized), "serializeError() returns an object");
    reporter.check(hasString(serialized, "name"), "serialized error has name");
    reporter.check(
      hasString(serialized, "message"),
      "serialized error has message",
    );
  }

  return toolset;
};

const validatePi = async (reporter, piModule, args, toolset) => {
  const detected = detectFactory(
    piModule,
    args["pi-factory"],
    /^create[A-Z].*PiTool$/,
  );

  reporter.check(
    detected !== undefined,
    args["pi-factory"] === undefined
      ? "./pi has exactly one create*PiTool factory export"
      : `./pi exports ${args["pi-factory"]}`,
  );

  if (detected === undefined) return;

  const piTool = await detected.factory();
  reporter.pass(`loaded Pi tool via ${detected.name}()`);

  reporter.check(hasString(piTool, "name"), "Pi tool has name string");
  reporter.check(hasString(piTool, "label"), "Pi tool has label string");
  reporter.check(
    hasString(piTool, "description"),
    "Pi tool has description string",
  );
  if (hasString(piTool, "description")) {
    reporter.check(
      !hasHowToDescriptionCue(piTool.description),
      "top-level Pi tool description is purpose-only, not usage instructions",
    );
  }
  reporter.check(isRecord(piTool.parameters), "Pi tool has parameters object");
  reporter.check(
    hasFunction(piTool, "execute"),
    "Pi tool has execute() function",
  );

  if (args.id !== undefined && hasString(piTool, "name")) {
    reporter.check(piTool.name === args.id, `Pi tool name is ${args.id}`);
  }

  const properties = isRecord(piTool.parameters?.properties)
    ? piTool.parameters.properties
    : undefined;
  reporter.check(properties !== undefined, "Pi parameters expose properties");

  if (properties !== undefined) {
    const actionEnum = Array.isArray(properties.action?.enum)
      ? properties.action.enum
      : [];

    for (const action of requiredPiActions) {
      reporter.check(
        actionEnum.includes(action),
        `Pi action enum includes ${action}`,
      );
    }

    reporter.check(
      Array.isArray(properties.command?.enum),
      "Pi command parameter has enum of operation names",
    );
    reporter.check(
      isRecord(properties.inputJson),
      "Pi parameters include inputJson object schema",
    );

    if (
      Array.isArray(properties.command?.enum) &&
      toolset !== undefined &&
      hasFunction(toolset, "listOperations")
    ) {
      const operationNames = toolset
        .listOperations()
        .map((operation) => operation?.name)
        .filter((name) => typeof name === "string");
      const missing = operationNames.filter(
        (name) => !properties.command.enum.includes(name),
      );
      reporter.check(
        missing.length === 0,
        missing.length === 0
          ? "Pi command enum includes all toolset operations"
          : `Pi command enum missing operations: ${missing.join(", ")}`,
      );
    }
  }

  if (hasFunction(piTool, "execute")) {
    const helpResult = await piTool.execute("validate-tool-surface", {
      action: "help",
    });
    const helpDetails = expectPiToolResultShape(
      reporter,
      helpResult,
      "Pi help action",
    );
    expectPiActionDetailsShape(reporter, helpDetails, "Pi help details", {
      ok: true,
      action: "help",
      field: "help",
    });

    if (toolset !== undefined && hasFunction(toolset, "listOperations")) {
      const [firstOperation] = toolset.listOperations();
      if (typeof firstOperation?.name === "string") {
        const commandHelp = await piTool.execute("validate-tool-surface", {
          action: "command_help",
          command: firstOperation.name,
        });
        const commandHelpDetails = expectPiToolResultShape(
          reporter,
          commandHelp,
          "Pi command_help action",
        );
        expectPiActionDetailsShape(
          reporter,
          commandHelpDetails,
          "Pi command_help details",
          {
            ok: true,
            action: "command_help",
            command: firstOperation.name,
            field: "commandHelp",
          },
        );

        const spec = hasFunction(toolset, "getCommandHelp")
          ? toolset.getCommandHelp(firstOperation.name)
          : undefined;
        const [example] = isRecord(spec) && Array.isArray(spec.examples)
          ? spec.examples
          : [];

        if (isRecord(example)) {
          const validateResult = await piTool.execute("validate-tool-surface", {
            action: "validate",
            command: firstOperation.name,
            inputJson: example,
          });
          const validateDetails = expectPiToolResultShape(
            reporter,
            validateResult,
            "Pi validate action",
          );
          expectPiActionDetailsShape(
            reporter,
            validateDetails,
            "Pi validate details",
            {
              ok: true,
              action: "validate",
              command: firstOperation.name,
              field: "validation",
            },
          );

          if (isRecord(validateDetails?.validation)) {
            reporter.check(
              validateDetails.validation.ok === true,
              "Pi validate details include successful validation",
            );
            reporter.check(
              isRecord(validateDetails.validation.input),
              "Pi validate details include normalized input",
            );
          }
        }
      }
    }

    const invalidValidate = await piTool.execute("validate-tool-surface", {
      action: "validate",
      command: "__validate_tool_surface_unknown__",
      inputJson: {},
    });
    const invalidValidateDetails = expectPiToolResultShape(
      reporter,
      invalidValidate,
      "Pi invalid validate action",
    );
    expectPiActionDetailsShape(
      reporter,
      invalidValidateDetails,
      "Pi invalid validate details",
      {
        ok: false,
        action: "validate",
        command: "__validate_tool_surface_unknown__",
      },
    );
  }
};

const validateCli = (reporter, root, pkg) => {
  const entries = getBinEntries(pkg);

  reporter.check(entries.length > 0, "package has CLI bin entry");
  if (entries.length === 0) return;

  const [binName, binTarget] = entries[0];
  const binPath = resolve(root, binTarget);
  reporter.check(existsSync(binPath), `CLI bin target exists: ${binTarget}`);

  if (!existsSync(binPath)) return;

  const help = spawnSync(process.execPath, [binPath, "--help"], {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000,
  });

  reporter.check(help.status === 0, `${binName} --help exits 0`);
  reporter.check(
    `${help.stdout}${help.stderr}`.trim().length > 0,
    `${binName} --help prints help text`,
  );

  const invalid = spawnSync(
    process.execPath,
    [binPath, "__validate_tool_surface_unknown__"],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 10_000,
    },
  );

  reporter.check(
    invalid.status !== 0,
    `${binName} invalid command exits non-zero`,
  );

  const stdout = invalid.stdout.trim();
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    parsed = undefined;
  }

  reporter.check(
    isRecord(parsed),
    `${binName} invalid command prints one JSON object to stdout`,
  );
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage());
    return;
  }

  const root = resolve(args._[0] ?? process.cwd());
  const reporter = createReporter();
  const pkgPath = join(root, "package.json");

  reporter.check(existsSync(pkgPath), "package.json exists");
  if (!existsSync(pkgPath)) {
    reporter.print();
    process.exitCode = 1;
    return;
  }

  const pkg = readJson(pkgPath);
  reporter.check(hasString(pkg, "name"), "package has name");

  const binEntries = getBinEntries(pkg);
  reporter.check(binEntries.length > 0, "package has at least one CLI bin");
  for (const [, target] of binEntries) {
    reporter.check(
      existsSync(resolve(root, target)),
      `CLI bin file exists: ${target}`,
    );
  }

  const toolsetEntry = getExportEntry(pkg, "./toolset");
  const piEntry = getExportEntry(pkg, "./pi");
  const toolsetTarget = resolvePackageTarget(
    root,
    getImportTarget(toolsetEntry),
  );
  const piTarget = resolvePackageTarget(root, getImportTarget(piEntry));

  reporter.check(toolsetEntry !== undefined, "package exports ./toolset");
  reporter.check(piEntry !== undefined, "package exports ./pi");
  reporter.check(
    toolsetTarget !== undefined && existsSync(toolsetTarget),
    "./toolset import target exists",
  );
  reporter.check(
    piTarget !== undefined && existsSync(piTarget),
    "./pi import target exists",
  );

  reporter.check(
    isRecord(pkg.pi) &&
      Array.isArray(pkg.pi.extensions) &&
      pkg.pi.extensions.length > 0,
    "package declares pi.extensions",
  );

  if (isRecord(pkg.pi) && Array.isArray(pkg.pi.extensions)) {
    for (const extension of pkg.pi.extensions) {
      reporter.check(
        typeof extension === "string" && existsSync(resolve(root, extension)),
        `Pi extension file exists: ${extension}`,
      );
    }
  }

  let toolset;
  if (toolsetTarget !== undefined && existsSync(toolsetTarget)) {
    try {
      const toolsetModule = await importPackageTarget(toolsetTarget);
      toolset = await validateToolset(reporter, toolsetModule, args);
    } catch (error) {
      reporter.fail(
        `failed to import/validate ./toolset: ${error.stack ?? error}`,
      );
    }
  }

  if (piTarget !== undefined && existsSync(piTarget)) {
    try {
      const piModule = await importPackageTarget(piTarget);
      await validatePi(reporter, piModule, args, toolset);
    } catch (error) {
      reporter.fail(`failed to import/validate ./pi: ${error.stack ?? error}`);
    }
  }

  if (args.runCli) {
    validateCli(reporter, root, pkg);
  } else {
    reporter.warn(
      "CLI runtime smoke checks skipped; pass --run-cli to enable them.",
    );
  }

  reporter.print();
  process.exitCode = reporter.failed ? 1 : 0;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
