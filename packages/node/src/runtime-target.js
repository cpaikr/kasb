export function runtimeTarget(platform = process.platform, arch = process.arch, report = process.report) {
  const linuxRuntime = platform === "linux" ? detectLinuxRuntime(report) : {};
  return {
    platform,
    arch,
    ...linuxRuntime,
    key: [platform, arch, linuxRuntime.libc].filter(Boolean).join("-")
  };
}

function detectLinuxRuntime(report) {
  try {
    const header = report?.getReport?.()?.header;
    if (!header) return { libc: "unknown" };
    if (typeof header.glibcVersionRuntime === "string" && header.glibcVersionRuntime.length > 0) {
      return { libc: "glibc", glibcVersion: header.glibcVersionRuntime };
    }
    return { libc: "musl" };
  } catch {
    return { libc: "unknown" };
  }
}

export function selectNativeTarget(targets, runtime, minimumGlibcVersion) {
  if (!runtimeMeetsGlibcFloor(runtime, minimumGlibcVersion)) return undefined;
  return targets.find((candidate) => matchesRuntime(candidate, runtime));
}

export function runtimeMeetsGlibcFloor(runtime, minimumGlibcVersion) {
  return runtime.libc !== "glibc" || versionAtLeast(runtime.glibcVersion, minimumGlibcVersion);
}

export function hasNativeTargetFamily(targets, runtime) {
  return targets.some((candidate) => matchesRuntime(candidate, runtime));
}

function matchesRuntime(candidate, runtime) {
  return candidate.npmPlatform === runtime.platform &&
    candidate.npmArch === runtime.arch &&
    (candidate.npmPlatform !== "linux" || candidate.libc === runtime.libc);
}

function versionAtLeast(actual, minimum) {
  const actualParts = numericVersion(actual);
  const minimumParts = numericVersion(minimum);
  if (!actualParts || !minimumParts) return false;
  const length = Math.max(actualParts.length, minimumParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (actualParts[index] ?? 0) - (minimumParts[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}

function numericVersion(value) {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)*$/u.test(value)) return undefined;
  return value.split(".").map(Number);
}
