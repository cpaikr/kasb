export function capabilityError(details) {
  const error = new Error(details?.message || "The native KASB operation failed.");
  if (details && typeof details === "object") {
    for (const field of ["code", "retryable", "parameter", "sourceUrl"]) {
      if (Object.hasOwn(details, field)) error[field] = details[field];
    }
  }
  error.name = "KasbFailure";
  return error;
}
