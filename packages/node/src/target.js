import { accessSync, constants, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

import { runtimeTarget, selectNativeTarget } from "./runtime-target.js";

const require = createRequire(import.meta.url);
let resolverConfiguration;

export class KasbNativeInstallError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "KasbNativeInstallError";
    this.code = code;
  }
}

export function resolveNativeTarget(requiredArtifact) {
  const { manifest, rootPackage } = loadResolverConfiguration();
  const runtime = runtimeTarget();
  const target = selectNativeTarget(manifest.targets, runtime);
  if (!target) {
    throw new KasbNativeInstallError(
      "unsupported_platform",
      `The KASB package does not support ${runtime.key}. Supported targets are ${manifest.targets.map(({ packageDirectory }) => packageDirectory).join(", ")}.`
    );
  }

  const packageJsonPath = findNativePackageJson(target.packageName);
  if (!packageJsonPath) {
    throw new KasbNativeInstallError(
      "missing_native_package",
      `The exact native package ${target.packageName}@${rootPackage.version} is not installed. Reinstall the KASB package with optional dependencies enabled.`
    );
  }

  let nativePackage;
  try {
    nativePackage = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    if (!validNativePackageMetadata(nativePackage, target.packageName)) throw new TypeError();
  } catch {
    throw new KasbNativeInstallError(
      "invalid_native_package",
      `The installed native package ${target.packageName} has invalid package metadata. Reinstall the KASB package.`
    );
  }
  if (nativePackage.version !== rootPackage.version) {
    throw new KasbNativeInstallError(
      "native_version_mismatch",
      `The installed native package version does not match ${rootPackage.name}@${rootPackage.version}. Reinstall both packages together.`
    );
  }

  const directory = dirname(packageJsonPath);
  const addonPath = resolve(directory, target.addonFile);
  const cliPath = resolve(directory, target.cliFile);
  const requiredPath = requiredArtifact === "addon" ? addonPath : cliPath;
  let artifact;
  try {
    artifact = statSync(requiredPath);
  } catch {
    throw new KasbNativeInstallError(
      "missing_native_artifact",
      `The installed native package ${target.packageName} is missing ${requiredArtifact === "addon" ? target.addonFile : target.cliFile}. Reinstall the KASB package.`
    );
  }
  if (!artifact.isFile()) {
    throw new KasbNativeInstallError(
      "invalid_native_artifact",
      `The installed native package ${target.packageName} contains an invalid ${requiredArtifact} artifact. Reinstall the KASB package.`
    );
  }
  if (requiredArtifact === "cli" && process.platform !== "win32") {
    try {
      accessSync(cliPath, constants.X_OK);
    } catch {
      throw new KasbNativeInstallError(
        "native_cli_not_executable",
        `The packaged KASB CLI is not executable. Reinstall the KASB package and preserve file permissions.`
      );
    }
  }

  return { ...target, key: target.packageDirectory, addonPath, cliPath };
}

function loadResolverConfiguration() {
  if (resolverConfiguration) return resolverConfiguration;
  try {
    const rootPackage = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8")
    );
    const manifest = JSON.parse(
      readFileSync(new URL("./native-targets.json", import.meta.url), "utf8")
    );
    if (!validRootPackage(rootPackage) || !validTargetManifest(manifest)) {
      throw new TypeError("invalid native resolver metadata");
    }
    resolverConfiguration = { manifest, rootPackage };
    return resolverConfiguration;
  } catch {
    throw new KasbNativeInstallError(
      "invalid_native_manifest",
      "The installed KASB package has invalid native target metadata. Reinstall the KASB package."
    );
  }
}

function findNativePackageJson(packageName) {
  for (const nodeModulesDirectory of require.resolve.paths(packageName) ?? []) {
    const candidate = join(nodeModulesDirectory, packageName, "package.json");
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Continue through Node's package lookup path before reporting it missing.
    }
  }
  return undefined;
}

function validNativePackageMetadata(value, packageName) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && value.name === packageName
    && typeof value.version === "string"
    && value.version.length > 0;
}

function validRootPackage(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && typeof value.name === "string"
    && value.name.length > 0
    && typeof value.version === "string"
    && value.version.length > 0;
}

function validTargetManifest(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Array.isArray(value.targets)
    && value.targets.length > 0
    && value.targets.every((target) => target !== null
      && typeof target === "object"
      && !Array.isArray(target)
      && [
        "rustTarget",
        "npmPlatform",
        "npmArch",
        "packageName",
        "packageDirectory",
        "addonFile",
        "cliFile",
      ].every((field) => typeof target[field] === "string" && target[field].length > 0)
      && (target.libc === undefined || typeof target.libc === "string"));
}
