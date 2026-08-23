import { describe, expect, test } from "bun:test";

import { runtimeTarget, selectNativeTarget } from "../dist/runtime-target.js";
import { KasbNativeInstallError } from "../dist/target.js";

describe("native runtime target selection", () => {
  test("detects Linux libc without guessing when runtime reports are unavailable", () => {
    expect(runtimeTarget("linux", "x64", {
      getReport: () => ({ header: { glibcVersionRuntime: "2.39" } }),
    })).toMatchObject({ key: "linux-x64-glibc", libc: "glibc" });
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
    })).toBe(targets[0]);
    expect(selectNativeTarget(targets, {
      platform: "linux",
      arch: "x64",
      libc: "unknown",
    })).toBeUndefined();
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
