import { ProviderFailure } from "../../capabilities/types.ts";

const requestTimeoutMs = 15_000;

export const fetchKasbJson = async (sourceUrl: string): Promise<unknown> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        accept: "application/json",
        "user-agent": "kasb-standards-cli/0.0.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ProviderFailure({
        code: response.status === 404 ? "not_found" : "source_unavailable",
        message: `KASB API 요청이 실패했습니다(status=${response.status}).`,
        retryable: response.status >= 500,
        sourceUrl,
      });
    }

    try {
      return await response.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ProviderFailure({
          code: "source_changed",
          message: "KASB API가 JSON이 아닌 응답을 반환했습니다.",
          retryable: false,
          sourceUrl,
        });
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof ProviderFailure) {
      throw error;
    }

    throw new ProviderFailure({
      code: "source_unavailable",
      message: "KASB API에 연결할 수 없습니다.",
      retryable: true,
      sourceUrl,
    });
  } finally {
    clearTimeout(timeout);
  }
};
