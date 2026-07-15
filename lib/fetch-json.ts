import {
  SOURCE_FETCH_ATTEMPTS,
  SOURCE_FETCH_TIMEOUT_MS,
} from "@/lib/source-config";

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

class UpstreamHttpError extends Error {
  readonly retryable: boolean;

  constructor(status: number) {
    super(`HTTP ${status}`);
    this.retryable = status === 408 || status === 425 || status === 429 || status >= 500;
  }
}

export async function fetchJsonWithRetry(
  url: string,
  init: RequestInit = {},
  {
    attempts = SOURCE_FETCH_ATTEMPTS,
    timeoutMs = SOURCE_FETCH_TIMEOUT_MS,
  }: {
    attempts?: number;
    timeoutMs?: number;
  } = {},
) {
  let lastError: Error | null = null;
  const totalAttempts = Math.max(1, Math.floor(attempts));
  const requestTimeoutMs = Math.max(1, timeoutMs);

  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        cache: "no-store",
        headers: {
          accept: "application/json",
          "user-agent": "CardanoDEXPulse/1.0 public-analytics-dashboard",
          ...init.headers,
        },
        signal: controller.signal,
      });

      if (!response.ok) throw new UpstreamHttpError(response.status);
      return await response.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown fetch error");
      const retryable = !(lastError instanceof UpstreamHttpError) || lastError.retryable;
      if (!retryable || attempt >= totalAttempts - 1) break;
      await wait(250 * 2 ** attempt);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error("Request failed");
}
