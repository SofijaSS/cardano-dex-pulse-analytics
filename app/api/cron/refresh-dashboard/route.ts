import { loadDashboardSnapshot } from "@/lib/dashboard-snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorizedCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) return request.headers.get("authorization") === `Bearer ${secret}`;

  return process.env.VERCEL === "1" &&
    request.headers.get("user-agent") === "vercel-cron/1.0";
}
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return Response.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  const startedAt = Date.now();
  const snapshot = await loadDashboardSnapshot({ force: true });

  return Response.json({
    cache: snapshot.status,
    generatedAt: snapshot.value.generatedAt,
    durationMs: Date.now() - startedAt,
  });
}
