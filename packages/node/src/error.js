export class KasbFailure extends Error {
  constructor(details) {
    const safe = validFailureDetails(details) ? details : INTERNAL_FAILURE;
    super(safe.message);
    this.name = "KasbFailure";
    this.code = safe.code;
    this.retryable = safe.retryable;
    for (const field of ["parameter", "sourceUrl"]) {
      if (Object.hasOwn(safe, field)) this[field] = safe[field];
    }
  }
}

export function capabilityError(details) {
  return new KasbFailure(validFailureDetails(details) ? details : INTERNAL_FAILURE);
}

export function invalidNodeInput() {
  return new KasbFailure({
    code: "invalid_input",
    message: "KASB input must be a JSON-serializable object.",
    retryable: false,
    parameter: "input",
  });
}

export function internalNativeFailure() {
  return new KasbFailure(INTERNAL_FAILURE);
}

const FAILURE_CODES = new Set([
  "invalid_input",
  "not_found",
  "source_unavailable",
  "source_changed",
  "partial_retrieval",
  "internal_failure",
]);

const INTERNAL_FAILURE = Object.freeze({
  code: "internal_failure",
  message: "The native KASB binding failed internally.",
  retryable: false,
});

function validFailureDetails(details) {
  if (!details || typeof details !== "object") return false;
  if (!FAILURE_CODES.has(details.code)) return false;
  if (typeof details.message !== "string" || typeof details.retryable !== "boolean") return false;
  if (Object.hasOwn(details, "parameter") && typeof details.parameter !== "string") return false;
  if (Object.hasOwn(details, "sourceUrl") && typeof details.sourceUrl !== "string") return false;
  return true;
}
