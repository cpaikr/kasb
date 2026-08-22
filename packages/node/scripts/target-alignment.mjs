export function assertTargetAlignment(targetManifest, packageJson) {
  const optionalDependencies = packageJson.optionalDependencies;
  if (optionalDependencies === undefined) return;

  const targetPackages = targetManifest.targets.map((target) => target.packageName).sort();
  const optionalPackages = Object.keys(optionalDependencies).sort();
  if (JSON.stringify(targetPackages) !== JSON.stringify(optionalPackages)) {
    throw new Error("native-targets.json and packages/node optionalDependencies disagree");
  }
  for (const packageName of targetPackages) {
    if (optionalDependencies[packageName] !== packageJson.version) {
      throw new Error(`${packageName} must use the exact root package version`);
    }
  }
}
