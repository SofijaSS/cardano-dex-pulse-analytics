import { NextResponse } from "next/server";
import {
  buildDashboardSessionToken,
  DASHBOARD_SESSION_COOKIE,
  DASHBOARD_SESSION_SECONDS,
  isDashboardAuthConfigured,
  isDashboardAuthEnabled,
  verifyDashboardCredentials,
} from "@/lib/auth";
import {
  clearLoginFailures,
  loginRateLimitStatus,
  recordLoginFailure,
} from "@/lib/login-rate-limit";

const MINIMUM_FAILURE_TIME_MS = 500;

async function finishFailureDelay(startedAt: number) {
  const remaining = MINIMUM_FAILURE_TIME_MS - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  if (!isDashboardAuthEnabled() || !isDashboardAuthConfigured()) {
    await finishFailureDelay(startedAt);
    return NextResponse.json(
      { error: "The sign-in service is not configured." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const rateLimit = loginRateLimitStatus(request);
  if (rateLimit.blocked) {
    await finishFailureDelay(startedAt);
    return NextResponse.json(
      { error: "Too many sign-in attempts. Please try again later." },
      {
        status: 429,
        headers: {
          "cache-control": "no-store",
          "retry-after": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  let credentials: { password?: unknown; username?: unknown };
  try {
    credentials = await request.json();
  } catch {
    await finishFailureDelay(startedAt);
    return NextResponse.json(
      { error: "Invalid username or password." },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  const username = typeof credentials.username === "string"
    ? credentials.username.slice(0, 128)
    : "";
  const password = typeof credentials.password === "string"
    ? credentials.password.slice(0, 512)
    : "";
  const valid = await verifyDashboardCredentials(username, password);
  if (!valid) {
    recordLoginFailure(request);
    await finishFailureDelay(startedAt);
    return NextResponse.json(
      { error: "Invalid username or password." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  clearLoginFailures(request);
  const response = NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
  response.cookies.set({
    name: DASHBOARD_SESSION_COOKIE,
    value: await buildDashboardSessionToken(),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DASHBOARD_SESSION_SECONDS,
  });
  return response;
}
