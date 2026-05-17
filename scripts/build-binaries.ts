import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, parse, resolve } from "node:path";
import {
  checksumFile,
  createExecutableArchive,
  type ReleaseArchiveType,
} from "./release-archive.ts";

const defaultOutdir = "dist-bin";
const entrypoint = "src/cli.ts";

type BinaryTarget = {
  readonly bunTarget: string;
  readonly assetPlatform: string;
  readonly assetArch: string;
  readonly executableName: string;
  readonly archiveType: ReleaseArchiveType;
};

const targets: readonly BinaryTarget[] = [
  {
    bunTarget: "bun-darwin-arm64",
    assetPlatform: "macos",
    assetArch: "arm64",
    executableName: "kasb",
    archiveType: "tar.gz",
  },
  {
    bunTarget: "bun-darwin-x64",
    assetPlatform: "macos",
    assetArch: "x64",
    executableName: "kasb",
    archiveType: "tar.gz",
  },
  {
    bunTarget: "bun-linux-x64",
    assetPlatform: "linux",
    assetArch: "x64",
    executableName: "kasb",
    archiveType: "tar.gz",
  },
  {
    bunTarget: "bun-linux-arm64",
    assetPlatform: "linux",
    assetArch: "arm64",
    executableName: "kasb",
    archiveType: "tar.gz",
  },
  {
    bunTarget: "bun-windows-x64",
    assetPlatform: "windows",
    assetArch: "x64",
    executableName: "kasb.exe",
    archiveType: "zip",
  },
];

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  version?: string;
};

if (!packageJson.version) {
  throw new Error("package.json is missing version.");
}

const parseArgs = (argv: readonly string[]) => {
  let outdir = defaultOutdir;
  let smokeTest = false;
  const selectedTargets: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--outdir") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --outdir.");
      }
      outdir = value;
      index += 1;
      continue;
    }

    if (arg === "--target") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --target.");
      }
      selectedTargets.push(...value.split(",").filter(Boolean));
      index += 1;
      continue;
    }

    if (arg === "--smoke-test") {
      smokeTest = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { outdir, selectedTargets, smokeTest };
};

const resolveManagedOutdir = (outdir: string): string => {
  const resolved = resolve(outdir);
  const forbidden = new Set([parse(resolved).root, resolve("."), resolve(homedir())]);

  if (forbidden.has(resolved)) {
    throw new Error(
      `Refusing to use unsafe release outdir: ${resolved}. Choose a dedicated build directory.`,
    );
  }

  return resolved;
};

const run = (cmd: string[]) => {
  const result = Bun.spawnSync({
    cmd,
    stdout: "inherit",
    stderr: "inherit",
  });

  if (result.exitCode !== 0) {
    throw new Error(`Command failed with exit code ${result.exitCode}: ${cmd.join(" ")}`);
  }
};

const createArchive = (target: BinaryTarget, executablePath: string, releaseDir: string) => {
  const archiveBase = `kasb-v${packageJson.version}-${target.assetPlatform}-${target.assetArch}`;
  const archiveName = `${archiveBase}.${target.archiveType}`;
  const archivePath = join(releaseDir, archiveName);

  createExecutableArchive({
    archivePath,
    archiveType: target.archiveType,
    executableName: target.executableName,
    executable: readFileSync(executablePath),
  });

  return { archiveName, archivePath };
};

const { outdir, selectedTargets, smokeTest } = parseArgs(Bun.argv.slice(2));
const selectedTargetSet = new Set(selectedTargets);
const buildTargets = selectedTargets.length === 0
  ? targets
  : targets.filter((target) => selectedTargetSet.has(target.bunTarget));

const unknownTargets = selectedTargets.filter(
  (selectedTarget) => !targets.some((target) => target.bunTarget === selectedTarget),
);

if (unknownTargets.length > 0) {
  throw new Error(`Unknown binary target(s): ${unknownTargets.join(", ")}`);
}

if (buildTargets.length === 0) {
  throw new Error("No binary targets selected.");
}

const managedOutdir = resolveManagedOutdir(outdir);
const workDir = join(managedOutdir, "work");
const releaseDir = join(managedOutdir, "release");

mkdirSync(managedOutdir, { recursive: true });
rmSync(workDir, { recursive: true, force: true });
rmSync(releaseDir, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });
mkdirSync(releaseDir, { recursive: true });

const checksums: string[] = [];

for (const target of buildTargets) {
  const targetDir = join(workDir, `${target.assetPlatform}-${target.assetArch}`);
  const executablePath = join(targetDir, target.executableName);

  mkdirSync(targetDir, { recursive: true });

  run([
    "bun",
    "build",
    entrypoint,
    "--compile",
    `--target=${target.bunTarget}`,
    "--outfile",
    executablePath,
    "--no-compile-autoload-dotenv",
    "--no-compile-autoload-bunfig",
  ]);

  if (!target.executableName.endsWith(".exe")) {
    chmodSync(executablePath, 0o755);
  }

  if (smokeTest) {
    run([executablePath, "--help"]);
  }

  const { archiveName, archivePath } = createArchive(target, executablePath, releaseDir);
  checksums.push(`${checksumFile(archivePath)}  ${archiveName}`);
}

writeFileSync(join(releaseDir, "checksums.txt"), `${checksums.join("\n")}\n`);

console.log(`Built ${buildTargets.length} standalone binary release asset(s) in ${releaseDir}`);
