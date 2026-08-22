import { createRequire } from "node:module";

import { capabilityError } from "./error.js";
import { KasbNativeInstallError, resolveNativeTarget } from "./target.js";

const require = createRequire(import.meta.url);
let binding;

export async function getParagraph(input, context = {}) {
  const operationName = "get-paragraph";
  const bridge = bridgeAbortSignal(context.signal);
  try {
    const encoded = await loadBinding().getParagraph(
      JSON.stringify(input),
      bridge.signal,
      bridge.signal?.aborted === true
    );
    const envelope = JSON.parse(encoded);
    if (envelope.ok) return envelope.value;
    if (envelope.cancelled) throw cancellationError(operationName);
    throw capabilityError(envelope.error);
  } finally {
    bridge.cleanup();
  }
}

function loadBinding() {
  if (binding) return binding;
  const target = resolveNativeTarget("addon");
  try {
    binding = require(target.addonPath);
    return binding;
  } catch (cause) {
    throw new KasbNativeInstallError(
      "native_addon_load_failed",
      `The native KASB addon for ${target.key} could not be loaded. Reinstall the KASB package.`,
      cause
    );
  }
}

function bridgeAbortSignal(signal) {
  if (!signal) return { signal: undefined, cleanup() {} };
  const controller = new AbortController();
  const forward = () => controller.abort(signal.reason);
  if (signal.aborted) forward();
  else signal.addEventListener("abort", forward, { once: true });
  return {
    signal: controller.signal,
    cleanup() {
      signal.removeEventListener("abort", forward);
    }
  };
}

function cancellationError(operationName) {
  const error = new Error(`KASB operation was aborted: ${operationName}`);
  error.name = "KasbToolsetError";
  error.code = "aborted";
  error.recoverable = false;
  error.retryable = true;
  error.operationName = operationName;
  return error;
}
