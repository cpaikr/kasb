import { createRequire } from "node:module";
import { channel } from "node:diagnostics_channel";

import { capabilityError, internalNativeFailure, invalidNodeInput } from "./error.js";
import { KasbNativeInstallError, resolveNativeTarget } from "./target.js";

const require = createRequire(import.meta.url);
const nativeDiagnostics = channel("sjunepark.kasb.native");
const bindingPanicDiagnostic = Object.freeze({ code: "binding_panic" });
let binding;

export const searchStandards = operation("search-standards");
export const getStandardStructure = operation("get-standard-structure");
export const getSection = operation("get-section");
export const getParagraph = operation("get-paragraph");
export const searchQna = operation("search-qna");
export const getQna = operation("get-qna");

function operation(operationName) {
  return (input, context = {}) => invoke(operationName, input, context);
}

async function invoke(operationName, input, context) {
  const inputJson = encodeInput(input);
  const bridge = bridgeAbortSignal(context.signal);
  try {
    let encoded;
    try {
      encoded = await loadBinding().executeOperation(
        operationName,
        inputJson,
        bridge.signal,
        bridge.signal?.aborted === true
      );
    } catch (error) {
      if (error instanceof KasbNativeInstallError) throw error;
      throw internalNativeFailure();
    }
    const envelope = decodeEnvelope(encoded);
    publishNativeDiagnostic(envelope);
    if (envelope.ok) return envelope.value;
    if (envelope.cancelled) throw await cancellationError(operationName);
    if (!envelope.error || typeof envelope.error !== "object") throw internalNativeFailure();
    throw capabilityError(envelope.error);
  } finally {
    bridge.cleanup();
  }
}

function publishNativeDiagnostic(envelope) {
  if (envelope.ok !== false || envelope.operatorSignal !== "binding_panic") return;
  if (envelope.error?.code !== "internal_failure" || !nativeDiagnostics.hasSubscribers) return;
  nativeDiagnostics.publish(bindingPanicDiagnostic);
}

function encodeInput(input) {
  let encoded;
  try {
    encoded = JSON.stringify(input);
  } catch {
    throw invalidNodeInput();
  }
  if (typeof encoded !== "string") throw invalidNodeInput();
  return encoded;
}

function decodeEnvelope(encoded) {
  let envelope;
  try {
    envelope = JSON.parse(encoded);
  } catch {
    throw internalNativeFailure();
  }
  if (!envelope || typeof envelope !== "object" || typeof envelope.ok !== "boolean") {
    throw internalNativeFailure();
  }
  if (envelope.ok === true && !Object.hasOwn(envelope, "value")) throw internalNativeFailure();
  return envelope;
}

function loadBinding() {
  if (binding) return binding;
  const target = resolveNativeTarget("addon");
  try {
    const loaded = require(target.addonPath);
    if (typeof loaded?.executeOperation !== "function") throw new TypeError("missing executeOperation");
    binding = loaded;
    return binding;
  } catch {
    throw new KasbNativeInstallError(
      "native_addon_load_failed",
      `The native KASB addon for ${target.key} could not be loaded. Reinstall the KASB package.`
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

async function cancellationError(operationName) {
  const { KasbToolsetError } = await import("./toolset.js");
  return new KasbToolsetError({
    code: "aborted",
    message: `KASB operation was aborted: ${operationName}`,
    recoverable: false,
    retryable: true,
    operationName,
  });
}
