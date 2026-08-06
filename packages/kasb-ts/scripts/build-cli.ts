import {
  chmodSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const defaultOutfile = "dist/cli.js";

const parseOutfile = (argv: readonly string[]): string => {
  const outfileIndex = argv.indexOf("--outfile");
  if (outfileIndex === -1) {
    return defaultOutfile;
  }

  const outfile = argv[outfileIndex + 1];
  if (!outfile) {
    throw new Error("Missing value for --outfile.");
  }

  return outfile;
};

const run = (cmd: readonly string[]): void => {
  const result = Bun.spawnSync({
    cmd: [...cmd],
    stdout: "inherit",
    stderr: "inherit",
  });

  if (result.exitCode !== 0) {
    process.exit(result.exitCode);
  }
};

const writeNodeCliHeader = (outfile: string): void => {
  const cli = readFileSync(outfile, "utf8");
  const executableHeader = "#!/usr/bin/env node\n";
  const bunBundleHeader = "// @bun\n";
  const withoutSourceShebang = cli.startsWith("#!")
    ? cli.slice(cli.indexOf("\n") + 1)
    : cli;
  const withoutBunHeader = withoutSourceShebang.startsWith(bunBundleHeader)
    ? withoutSourceShebang.slice(bunBundleHeader.length)
    : withoutSourceShebang;

  writeFileSync(outfile, `${executableHeader}${withoutBunHeader}`);
  chmodSync(outfile, 0o755);
};

const rewriteDeclarationImports = (directory: string): void => {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      rewriteDeclarationImports(path);
      continue;
    }

    if (!entry.endsWith(".d.ts")) {
      continue;
    }

    const source = readFileSync(path, "utf8");
    writeFileSync(path, source.replaceAll(/(["']\.[^"']+)\.ts(["'])/g, "$1.js$2"));
  }
};

const outfile = parseOutfile(Bun.argv.slice(2));
const outdir = dirname(outfile);

if (outfile === defaultOutfile) {
  rmSync(outdir, { recursive: true, force: true });
}

mkdirSync(outdir, { recursive: true });

run([
  process.execPath,
  "build",
  "src/cli.ts",
  "--target=node",
  "--outfile",
  outfile,
  "--minify",
  "--sourcemap=none",
]);
writeNodeCliHeader(outfile);

run(["bun", "run", "tsc", "-p", "tsconfig.build.json", "--outDir", outdir]);
rewriteDeclarationImports(outdir);

console.log(`Built Node-compatible CLI at ${outfile}`);
console.log(`Built shared ESM library modules in ${outdir}`);
