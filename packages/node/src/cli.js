#!/usr/bin/env node
import { spawn } from "node:child_process";

import { resolveNativeTarget } from "./target.js";

let target;
try {
  target = resolveNativeTarget("cli");
} catch (error) {
  installationFailure(error);
}

if (target) {
  launch(target.cliPath, process.argv.slice(2));
}

function launch(binary, args) {
  let settled = false;
  const child = spawn(binary, args, {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: "inherit",
    windowsHide: false
  });
  const handlers = new Map();
  for (const signal of forwardedSignals()) {
    const handler = () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      try {
        child.kill(signal);
      } catch {
        // The child may have exited between the state check and signal delivery.
      }
    };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }

  child.once("error", (error) => {
    if (settled) return;
    settled = true;
    cleanup(handlers);
    installationFailure({
      code: "native_cli_spawn_failed",
      message: `The packaged KASB CLI could not be launched: ${error.code || "spawn failed"}. Reinstall the KASB package.`
    });
  });

  child.once("exit", (code, signal) => {
    if (settled) return;
    settled = true;
    cleanup(handlers);
    if (signal) mirrorSignal(signal);
    else process.exitCode = code ?? 1;
  });
}

function forwardedSignals() {
  return process.platform === "win32"
    ? ["SIGINT", "SIGTERM", "SIGBREAK"]
    : ["SIGHUP", "SIGINT", "SIGTERM", "SIGQUIT"];
}

function cleanup(handlers) {
  for (const [signal, handler] of handlers) process.removeListener(signal, handler);
}

function mirrorSignal(signal) {
  if (process.platform === "win32") {
    // Inferred pending the later Windows native and packed-consumer gates.
    process.exitCode = signal === "SIGINT" ? 130 : 143;
    return;
  }
  try {
    process.kill(process.pid, signal);
  } catch {
    process.exitCode = 1;
  }
}

function installationFailure(error) {
  const code = error?.code || "native_installation_error";
  const message = error?.message || "The KASB native installation is incomplete.";
  process.stderr.write(`kasb: ${code}: ${message}\n`);
  process.exitCode = 1;
}
