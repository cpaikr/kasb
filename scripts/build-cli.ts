import { chmodSync, readFileSync, writeFileSync } from "node:fs";

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

const outfile = parseOutfile(Bun.argv.slice(2));

const buildResult = Bun.spawnSync({
  cmd: [
    process.execPath,
    "build",
    "src/cli.ts",
    "--target=node",
    "--outfile",
    outfile,
    "--minify",
    "--sourcemap=none",
  ],
  stdout: "inherit",
  stderr: "inherit",
});

if (buildResult.exitCode !== 0) {
  process.exit(buildResult.exitCode);
}

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

console.log(`Built Node-compatible CLI at ${outfile}`);
