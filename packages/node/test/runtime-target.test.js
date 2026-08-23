import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

import { runtimeTarget, selectNativeTarget } from "../dist/runtime-target.js";
import { KasbNativeInstallError } from "../dist/target.js";

describe("native runtime target selection", () => {
  test("detects Linux libc without guessing when runtime reports are unavailable", () => {
    expect(runtimeTarget("linux", "x64", {
      getReport: () => ({ header: { glibcVersionRuntime: "2.39" } }),
    })).toMatchObject({ key: "linux-x64-glibc", libc: "glibc", glibcVersion: "2.39" });
    expect(runtimeTarget("linux", "arm64", {
      getReport: () => ({ header: {} }),
    })).toMatchObject({ key: "linux-arm64-musl", libc: "musl" });
    expect(runtimeTarget("linux", "x64", {
      getReport: () => { throw new Error("unavailable"); },
    })).toMatchObject({ key: "linux-x64-unknown", libc: "unknown" });
  });

  test("requires an exact platform, architecture, and libc match", () => {
    const targets = [{ npmPlatform: "linux", npmArch: "x64", libc: "glibc" }];
    expect(selectNativeTarget(targets, {
      platform: "linux",
      arch: "x64",
      libc: "glibc",
      glibcVersion: "2.39",
    }, "2.28")).toBe(targets[0]);
    expect(selectNativeTarget(targets, {
      platform: "linux",
      arch: "x64",
      libc: "unknown",
    }, "2.28")).toBeUndefined();
  });

  test("rejects GNU/Linux runtimes below or missing the glibc floor", () => {
    const targets = [{ npmPlatform: "linux", npmArch: "x64", libc: "glibc" }];
    for (const glibcVersion of ["2.27", "invalid", undefined]) {
      expect(selectNativeTarget(targets, {
        platform: "linux",
        arch: "x64",
        libc: "glibc",
        glibcVersion,
      }, "2.28")).toBeUndefined();
    }
    for (const glibcVersion of ["2.28", "2.28.1"]) {
      expect(selectNativeTarget(targets, {
        platform: "linux",
        arch: "x64",
        libc: "glibc",
        glibcVersion,
      }, "2.28")).toBe(targets[0]);
    }
  });

  test("reports the glibc floor before the addon resolver loads artifacts", () => {
    const resolver = new URL("../dist/target.js", import.meta.url).href;
    const result = simulatedGlibcProcess(`
      const { resolveNativeTarget } = await import(${JSON.stringify(resolver)});
      try {
        resolveNativeTarget("addon");
      } catch (error) {
        console.log(JSON.stringify({ name: error.name, code: error.code, message: error.message }));
      }
    `);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      name: "KasbNativeInstallError",
      code: "unsupported_platform",
      message: "The KASB package requires glibc 2.28 or newer; detected 2.27. Use a system with glibc 2.28 or newer.",
    });
    expect(result.stderr).toBe("");
  });

  test("reports the glibc floor before the packaged launcher resolves artifacts", () => {
    const launcher = new URL("../dist/cli.js", import.meta.url).href;
    const result = simulatedGlibcProcess(`await import(${JSON.stringify(launcher)});`);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "kasb: unsupported_platform: The KASB package requires glibc 2.28 or newer; detected 2.27. Use a system with glibc 2.28 or newer.\n",
    );
  });

  test("keeps unsupported architectures ahead of the glibc floor diagnostic", () => {
    const resolver = new URL("../dist/target.js", import.meta.url).href;
    const result = simulatedGlibcProcess(`
      const { resolveNativeTarget } = await import(${JSON.stringify(resolver)});
      try {
        resolveNativeTarget("addon");
      } catch (error) {
        console.log(JSON.stringify({ code: error.code, message: error.message }));
      }
    `, "riscv64");

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      code: "unsupported_platform",
      message: "The KASB package does not support linux-riscv64-glibc. Supported targets are linux-x64-gnu, linux-arm64-gnu, darwin-arm64, win32-x64-msvc.",
    });
    expect(result.stderr).toBe("");
  });

  test("does not retain raw loader errors as a public cause", () => {
    const error = new KasbNativeInstallError(
      "missing_native_package",
      "Reinstall the KASB package.",
      new Error("private resolution detail"),
    );
    expect(error).toMatchObject({
      name: "KasbNativeInstallError",
      code: "missing_native_package",
      message: "Reinstall the KASB package.",
    });
    expect(Object.hasOwn(error, "cause")).toBeFalse();
  });
});

function simulatedGlibcProcess(source, arch = "x64") {
  return spawnSync("node", [
    "--input-type=module",
    "-e",
    `
      if (process.release.name !== "node") throw new Error("glibc probe requires Node.js");
      Object.defineProperty(process, "platform", { value: "linux" });
      Object.defineProperty(process, "arch", { value: ${JSON.stringify(arch)} });
      process.report.getReport = () => ({ header: { glibcVersionRuntime: "2.27" } });
      ${source}
    `,
  ], { encoding: "utf8" });
}
