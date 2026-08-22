import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

import { runtimeTarget, selectNativeTarget } from "./runtime-target.js";

const require = createRequire(import.meta.url);
const rootPackage = require("../package.json");

const manifest = JSON.parse(
  readFileSync(new URL("./native-targets.json", import.meta.url), "utf8")
);

export class KasbNativeInstallError extends Error {
  constructor(code, message, cause) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "KasbNativeInstallError";
    this.code = code;
  }
}

export function resolveNativeTarget(requiredArtifact) {
  const runtime = runtimeTarget();
  const target = selectNativeTarget(manifest.targets, runtime);
  if (!target) {
    throw new KasbNativeInstallError(
      "unsupported_platform",
      `The KASB native probe does not support ${runtime.key}.`
    );
  }

  let packageJsonPath;
  try {
    packageJsonPath = require.resolve(`${target.packageName}/package.json`);
  } catch (cause) {
    throw new KasbNativeInstallError(
      "missing_native_package",
      `The exact native package ${target.packageName}@${rootPackage.version} is not installed. Reinstall the KASB package with optional dependencies enabled.`,
      cause
    );
  }

  const nativePackage = require(packageJsonPath);
  if (nativePackage.version !== rootPackage.version) {
    throw new KasbNativeInstallError(
      "native_version_mismatch",
      `The native package ${target.packageName}@${nativePackage.version} does not match ${rootPackage.name}@${rootPackage.version}. Reinstall both packages together.`
    );
  }

  const directory = dirname(packageJsonPath);
  const addonPath = resolve(directory, target.addonFile);
  const cliPath = resolve(directory, target.cliFile);
  const requiredPath = requiredArtifact === "addon" ? addonPath : cliPath;
  if (!existsSync(requiredPath)) {
    throw new KasbNativeInstallError(
      "missing_native_artifact",
      `The installed native package ${target.packageName} is missing ${requiredArtifact === "addon" ? target.addonFile : target.cliFile}. Reinstall the KASB package.`
    );
  }

  return { ...target, key: target.packageDirectory, addonPath, cliPath };
}
