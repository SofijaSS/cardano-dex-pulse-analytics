import { loadDashboardSnapshot } from "@/lib/dashboard-snapshot";
import { revalidateDashboardSources } from "@/lib/source-snapshot-cache";
import { captureWeeklyReportingSnapshot } from "@/lib/weekly-snapshot-store";
import {
  isWeeklyCaptureHour,
  latestReportingWeekKey,
} from "@/lib/weekly-reporting";

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

  const now = new Date();
  if (!isWeeklyCaptureHour(now)) {
    return Response.json({
      status: "skipped",
      reason: "It is not Wednesday 08:00 in Europe/Belgrade.",
      checkedAt: now.toISOString(),
    });
  }

  revalidateDashboardSources();
  const dashboard = await loadDashboardSnapshot({ force: true });
  const snapshot = await captureWeeklyReportingSnapshot(
    dashboard.value,
    latestReportingWeekKey(now),
    now,
  );

  return Response.json({
    status: snapshot.status,
    weekKey: snapshot.weekKey,
    scheduledFor: snapshot.scheduledFor,
    capturedAt: snapshot.capturedAt,
    sourceGeneratedAt: snapshot.sourceGeneratedAt,
  });
}
