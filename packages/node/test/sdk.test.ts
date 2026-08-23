import { describe, expect, test } from "bun:test";

import {
  KasbFailure,
  getParagraph,
} from "../dist/index.js";

describe("Rust-backed Node SDK facade", () => {
  test("rejects non-JSON inputs before loading a native addon", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const forged = {
      toJSON() {
        const error = new Error("secret serializer failure");
        error.name = "KasbFailure";
        Object.assign(error, { code: "source_changed", payload: { secret: true } });
        throw error;
      },
    };

    for (const input of [undefined, 1n, circular, forged]) {
      await expect(getParagraph(input as never)).rejects.toMatchObject({
        name: "KasbFailure",
        code: "invalid_input",
        retryable: false,
        parameter: "input",
      });
    }
  });

  test("keeps failure projection on the public allowlist", () => {
    const failure = new KasbFailure({
      message: "provider changed",
      code: "source_changed",
      retryable: false,
      sourceUrl: "https://db.kasb.or.kr/api/standard",
      stack: "injected",
      payload: { secret: true },
    } as never);

    expect(failure).toMatchObject({
      name: "KasbFailure",
      message: "provider changed",
      code: "source_changed",
      retryable: false,
      sourceUrl: "https://db.kasb.or.kr/api/standard",
    });
    expect(failure.stack).not.toBe("injected");
    expect(Object.hasOwn(failure, "payload")).toBeFalse();
  });

  test("falls back to a complete sanitized failure for malformed details", () => {
    const failure = new KasbFailure({
      code: "source_changed",
      message: "secret",
      retryable: "not-a-boolean",
      cause: new Error("private dependency detail"),
    } as never);

    expect(failure).toMatchObject({
      name: "KasbFailure",
      code: "internal_failure",
      message: "The native KASB binding failed internally.",
      retryable: false,
    });
    expect(Object.hasOwn(failure, "cause")).toBeFalse();
  });

});
