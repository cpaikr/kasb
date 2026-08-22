export function runtimeTarget(platform = process.platform, arch = process.arch, report = process.report) {
  const libc = platform === "linux"
    ? report?.getReport()?.header?.glibcVersionRuntime ? "glibc" : "musl"
    : undefined;
  return {
    platform,
    arch,
    libc,
    key: [platform, arch, libc].filter(Boolean).join("-")
  };
}

export function selectNativeTarget(targets, runtime) {
  return targets.find((candidate) =>
    candidate.npmPlatform === runtime.platform &&
    candidate.npmArch === runtime.arch &&
    (candidate.npmPlatform !== "linux" || candidate.libc === runtime.libc)
  );
}
