import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const repoRoot = join(import.meta.dir, "..");
const nodeRuntime = process.env.KASB_NODE_RUNTIME ?? "node";

const decode = (value: Uint8Array<ArrayBufferLike>) => new TextDecoder().decode(value);

const run = (cmd: readonly string[], cwd = repoRoot) => {
  const result = Bun.spawnSync({
    cmd: [...cmd],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });

  if (result.exitCode !== 0) {
    throw new Error(`Command failed: ${cmd.join(" ")}\nstdout:\n${decode(result.stdout)}\nstderr:\n${decode(result.stderr)}`);
  }

  return result;
};

type PackedPackageJson = {
  readonly dependencies?: Record<string, string>;
};

const readPackedDependencyNames = (packageRoot: string): string[] => {
  const packageJson = JSON.parse(
    readFileSync(join(packageRoot, "package.json"), "utf8"),
  ) as PackedPackageJson;

  return Object.keys(packageJson.dependencies ?? {});
};

const linkPackedDependencies = (packageRoot: string, consumerRoot: string): void => {
  for (const dependencyName of readPackedDependencyNames(packageRoot)) {
    const source = join(repoRoot, "node_modules", dependencyName);
    if (!existsSync(source)) {
      throw new Error(`Missing local dependency ${dependencyName}. Run bun install before package smoke tests.`);
    }

    const destination = join(consumerRoot, "node_modules", dependencyName);
    mkdirSync(dirname(destination), { recursive: true });
    symlinkSync(source, destination, "dir");
  }
};

describe("packed package surface", () => {
  let tempDir: string;
  let tarball: string;
  let tarEntries: string[];

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "kasb-pack-"));

    run([process.execPath, "run", "build"]);

    const pack = run([
      "npm",
      "pack",
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      tempDir,
    ]);
    const packed = JSON.parse(decode(pack.stdout)) as [{ filename: string }];
    tarball = join(tempDir, packed[0].filename);

    const list = run(["tar", "-tzf", tarball]);
    tarEntries = decode(list.stdout).trim().split("\n");
  }, 60_000);

  afterAll(() => {
    rmSync(tempDir, { force: true, recursive: true });
  });

  test("includes the built neutral toolset export and declarations", () => {
    expect(tarEntries).toContain("package/dist/toolset.js");
    expect(tarEntries).toContain("package/dist/toolset.d.ts");
    expect(tarEntries).toContain("package/dist/cli.js");
    expect(tarEntries).toContain("package/package.json");
  });

  test("can be imported by a consumer through @sjunepark/kasb/toolset", () => {
    const consumerRoot = join(tempDir, "consumer");
    const packageRoot = join(consumerRoot, "node_modules", "@sjunepark", "kasb");
    mkdirSync(packageRoot, { recursive: true });
    run(["tar", "-xzf", tarball, "-C", packageRoot, "--strip-components", "1"]);
    linkPackedDependencies(packageRoot, consumerRoot);

    expect(existsSync(join(packageRoot, "dist", "toolset.js"))).toBe(true);
    expect(existsSync(join(packageRoot, "dist", "toolset.d.ts"))).toBe(true);

    const smoke = run([
      nodeRuntime,
      "--input-type=module",
      "--eval",
      [
        "import { createKasbToolset } from '@sjunepark/kasb/toolset';",
        "const toolset = createKasbToolset();",
        "const help = toolset.help();",
        "if (help.id !== 'kasb') throw new Error('unexpected help id');",
        "if (!toolset.getCommandHelp('search-standards')) throw new Error('missing command help');",
        "console.log(JSON.stringify({ operations: toolset.listOperations().length }));",
      ].join("\n"),
    ], consumerRoot);

    expect(JSON.parse(decode(smoke.stdout))).toEqual({ operations: 6 });
  });
});
