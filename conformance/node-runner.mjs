import { createRequire } from "node:module";
import { subscribe, unsubscribe } from "node:diagnostics_channel";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const require = createRequire(import.meta.url);

try {
  const request = JSON.parse(await readStdin());
  if (request.protocolVersion !== 1) throw new Error(`unsupported protocol ${request.protocolVersion}`);

  const { resolveNativeTarget } = await import(resolve(repositoryRoot, "packages/node/dist/target.js"));
  const addon = require(resolveNativeTarget("addon").addonPath);
  if (typeof addon.configureFixture !== "function") {
    throw new Error("production addon cannot run the Node conformance protocol");
  }
  addon.configureFixture(JSON.stringify({ routes: request.routes }));

  const sdk = await import(resolve(repositoryRoot, "packages/node/dist/index.js"));
  const operations = {
    "search-standards": sdk.searchStandards,
    "get-standard-structure": sdk.getStandardStructure,
    "get-section": sdk.getSection,
    "get-paragraph": sdk.getParagraph,
    "search-qna": sdk.searchQna,
    "get-qna": sdk.getQna,
  };
  const operation = operations[request.operation];
  if (!operation) throw new Error(`unknown Node conformance operation ${request.operation}`);

  const diagnostics = [];
  const diagnosticSubscriber = (message) => diagnostics.push({ ...message });
  if (request.captureNativeDiagnostics === true) {
    subscribe("sjunepark.kasb.native", diagnosticSubscriber);
  }

  try {
    const controller = request.abortAfterStart === true ? new AbortController() : undefined;
    const pending = operation(request.input, controller ? { signal: controller.signal } : undefined);
    if (controller) setImmediate(() => controller.abort());
    const value = await pending;
    process.stdout.write(JSON.stringify({
      ok: true,
      value,
      ...(request.captureNativeDiagnostics === true ? { diagnostics } : {}),
    }));
  } catch (error) {
    const details = {};
    for (const field of [
      "code",
      "message",
      "recoverable",
      "retryable",
      "operationName",
      "parameter",
      "sourceUrl",
    ]) {
      if (Object.hasOwn(error, field) || field === "message") details[field] = error[field];
    }
    process.stdout.write(JSON.stringify({
      ok: false,
      error: details,
      ...(request.captureNativeDiagnostics === true ? { diagnostics } : {}),
    }));
  } finally {
    if (request.captureNativeDiagnostics === true) {
      unsubscribe("sjunepark.kasb.native", diagnosticSubscriber);
    }
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

async function readStdin() {
  process.stdin.setEncoding("utf8");
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}
