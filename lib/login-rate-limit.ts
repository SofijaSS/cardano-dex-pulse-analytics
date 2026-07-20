const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;
const MAX_TRACKED_CLIENTS = 1_000;

type AttemptWindow = {
  failures: number;
  resetAt: number;
};

const attempts = new Map<string, AttemptWindow>();

function clientKey(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function currentWindow(request: Request, now = Date.now()) {
  const key = clientKey(request);
  const existing = attempts.get(key);
  if (!existing || existing.resetAt <= now) {
    const fresh = { failures: 0, resetAt: now + WINDOW_MS };
    attempts.set(key, fresh);
    return { key, window: fresh };
  }
  return { key, window: existing };
}

function prune(now = Date.now()) {
  if (attempts.size < MAX_TRACKED_CLIENTS) return;
  for (const [key, value] of attempts) {
    if (value.resetAt <= now) attempts.delete(key);
  }
  if (attempts.size < MAX_TRACKED_CLIENTS) return;
  const oldestKey = attempts.keys().next().value;
  if (oldestKey) attempts.delete(oldestKey);
}

export function loginRateLimitStatus(request: Request) {
  prune();
  const { window } = currentWindow(request);
  return {
    blocked: window.failures >= MAX_FAILURES,
    retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - Date.now()) / 1000)),
  };
}

export function recordLoginFailure(request: Request) {
  const { window } = currentWindow(request);
  window.failures += 1;
}

export function clearLoginFailures(request: Request) {
  attempts.delete(clientKey(request));
}
