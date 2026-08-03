import { describe, expect, it } from "vitest";
import { buildMockDashboardData } from "../lib/mock-data";
import {
  applyWeeklyReportingSnapshots,
  buildWeeklyReportingSnapshot,
  getSeededWeeklySnapshot,
  isWeeklyCaptureHour,
  latestReportingWeekKey,
  previousReportingWeekKey,
  reportingScheduledFor,
} from "../lib/weekly-reporting";

describe("Wednesday weekly reporting cutoff", () => {
  it("keeps the prior Wednesday before 08:00 and advances at 08:00 Belgrade time", () => {
    expect(latestReportingWeekKey(new Date("2026-08-05T05:59:59Z"))).toBe(
      "2026-07-29",
    );
    expect(latestReportingWeekKey(new Date("2026-08-05T06:00:00Z"))).toBe(
      "2026-08-05",
    );
    expect(isWeeklyCaptureHour(new Date("2026-08-05T06:15:00Z"))).toBe(true);
    expect(isWeeklyCaptureHour(new Date("2026-08-05T07:00:00Z"))).toBe(false);
  });

  it("moves the UTC cron hour with Central European daylight saving time", () => {
    expect(reportingScheduledFor("2026-07-29")).toBe(
      "2026-07-29T06:00:00.000Z",
    );
    expect(reportingScheduledFor("2027-01-13")).toBe(
      "2027-01-13T07:00:00.000Z",
    );
    expect(previousReportingWeekKey("2026-08-05")).toBe("2026-07-29");
  });
});

describe("weekly reporting snapshots", () => {
  it("stores both ADA and USD values at the Wednesday cutoff", () => {
    const dashboard = buildMockDashboardData();
    dashboard.price.usd = 0.5;
    dashboard.dexes[0].volume7dUsd = 3_230_000;
    const snapshot = buildWeeklyReportingSnapshot(
      dashboard,
      "2026-08-05",
      new Date("2026-08-05T06:00:10Z"),
    );

    expect(snapshot.status).toBe("captured");
    expect(snapshot.dexes.minswap).toMatchObject({
      volume7dAda: 6_460_000,
      volume7dUsd: 3_230_000,
    });
  });

  it("preserves the 29 July WingRiders V2 slide value until the next cutoff", () => {
    const dashboard = buildMockDashboardData();
    dashboard.price.usd = 0.2;
    const template = dashboard.dexes[0];
    dashboard.dexes = [
      {
        ...template,
        id: "wingriders",
        name: "WingRiders",
        rowKind: "protocol",
        tableRole: "detail",
      },
      {
        ...template,
        id: "wingriders-v2",
        name: "WingRiders V2",
        rowKind: "version",
        tableRole: "primary",
        parentId: "wingriders",
        protocolVersion: "V2",
      },
    ];
    const current = getSeededWeeklySnapshot("2026-07-29");
    const previous = getSeededWeeklySnapshot("2026-07-22");
    expect(current).not.toBeNull();
    expect(previous).not.toBeNull();

    const result = applyWeeklyReportingSnapshots(
      dashboard,
      current!,
      previous!,
    );
    const wingRidersV2 = result.dexes.find(
      (dex) => dex.id === "wingriders-v2",
    );

    expect((wingRidersV2?.volume7dUsd ?? 0) / 0.2).toBe(6_460_000);
    expect((wingRidersV2?.previous7dUsd ?? 0) / 0.2).toBe(15_430_000);
    expect(wingRidersV2?.weekChangePct).toBe(-58.2);
    expect(result.weeklyReporting).toMatchObject({
      currentWeekKey: "2026-07-29",
      previousWeekKey: "2026-07-22",
      currentStatus: "seeded",
    });
  });
});
