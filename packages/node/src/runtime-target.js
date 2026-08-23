export function runtimeTarget(platform = process.platform, arch = process.arch, report = process.report) {
  const libc = platform === "linux" ? detectLinuxLibc(report) : undefined;
  return {
    platform,
    arch,
    libc,
    key: [platform, arch, libc].filter(Boolean).join("-")
  };
}

function detectLinuxLibc(report) {
  try {
    const header = report?.getReport?.()?.header;
    if (!header) return "unknown";
    return header.glibcVersionRuntime ? "glibc" : "musl";
  } catch {
    return "unknown";
  }
}

export function selectNativeTarget(targets, runtime) {
  return targets.find((candidate) =>
    candidate.npmPlatform === runtime.platform &&
    candidate.npmArch === runtime.arch &&
    (candidate.npmPlatform !== "linux" || candidate.libc === runtime.libc)
  );
}
