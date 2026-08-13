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

  it("keeps live WingRiders V2 7d while preserving the 29 July slide value", () => {
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
        volume7dUsd: 1_400_000,
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

    expect((wingRidersV2?.volume7dUsd ?? 0) / 0.2).toBe(7_000_000);
    expect((wingRidersV2?.reportingVolume7dUsd ?? 0) / 0.2).toBe(
      6_460_000,
    );
    expect((wingRidersV2?.previous7dUsd ?? 0) / 0.2).toBe(15_430_000);
    expect(wingRidersV2?.weekChangePct).toBe(-58.2);
    expect(result.weeklyReporting).toMatchObject({
      currentWeekKey: "2026-07-29",
      previousWeekKey: "2026-07-22",
      currentStatus: "seeded",
    });
  });

  it("preserves the 12 August capture and audited Dano null correction", () => {
    const snapshot = getSeededWeeklySnapshot("2026-08-12");

    expect(snapshot).not.toBeNull();
    expect(snapshot).toMatchObject({
      capturedAt: "2026-08-12T06:08:15.138Z",
      scheduledFor: "2026-08-12T06:00:00.000Z",
      status: "captured",
    });
    expect(snapshot?.dexes["wingriders-v2"].volume7dAda).toBeCloseTo(
      5_423_250.643136033,
      6,
    );
    expect(snapshot?.dexes["dano-finance"].volume7dAda).toBeCloseTo(
      54_776_167.717773,
      6,
    );
  });

  it("backfills the 5 August presentation values into 12 August comparisons", () => {
    const dashboard = buildMockDashboardData();
    dashboard.price.usd = 0.2;
    const template = dashboard.dexes[0];
    dashboard.dexes = [
      {
        ...template,
        id: "wingriders-v2",
        name: "WingRiders V2",
        rowKind: "version",
        tableRole: "primary",
        parentId: "wingriders",
        protocolVersion: "V2",
        volume7dUsd: 1_200_000,
      },
    ];
    const current = getSeededWeeklySnapshot("2026-08-12");
    const previous = getSeededWeeklySnapshot("2026-08-05");

    expect(previous?.dexes).toMatchObject({
      "minswap-v2": { volume7dAda: 22_030_000 },
      "dano-finance": { volume7dAda: 17_950_000 },
      "wingriders-v2": { volume7dAda: 6_130_000 },
      "sundaeswap-v3": { volume7dAda: 1_270_000 },
      splash: { volume7dAda: 839_120 },
      cswap: { volume7dAda: 802_610 },
      "minswap-v1": { volume7dAda: 383_010 },
      vyfinance: { volume7dAda: 251_840 },
      "sundaeswap-v1": { volume7dAda: 94_570 },
      "wingriders-v1": { volume7dAda: 69_340 },
    });

    const result = applyWeeklyReportingSnapshots(
      dashboard,
      current!,
      previous!,
    );
    expect((result.dexes[0].volume7dUsd ?? 0) / 0.2).toBe(6_000_000);
    expect((result.dexes[0].reportingVolume7dUsd ?? 0) / 0.2).toBeCloseTo(
      5_423_250.643136033,
      6,
    );
    expect((result.dexes[0].previous7dUsd ?? 0) / 0.2).toBe(6_130_000);
    expect(result.dexes[0].weekChangePct).toBeCloseTo(-11.5294, 4);
    expect(result.weeklyReporting?.previousWeekKey).toBe("2026-08-05");
  });

  it("keeps live Dano 7d while using the corrected Wednesday snapshots", () => {
    const dashboard = buildMockDashboardData();
    dashboard.price.usd = 0.2;
    const template = dashboard.dexes[0];
    dashboard.dexes = [
      {
        ...template,
        id: "dano-finance",
        name: "Dano Finance",
        rowKind: "protocol",
        tableRole: "primary",
        parentId: null,
        protocolVersion: null,
        volume7dUsd: 12_000_000,
      },
    ];
    const current = getSeededWeeklySnapshot("2026-08-12");
    const previous = getSeededWeeklySnapshot("2026-08-05");

    const result = applyWeeklyReportingSnapshots(
      dashboard,
      current!,
      previous!,
    );
    const dano = result.dexes[0];

    expect((dano.volume7dUsd ?? 0) / 0.2).toBe(60_000_000);
    expect((dano.reportingVolume7dUsd ?? 0) / 0.2).toBeCloseTo(
      54_776_167.717773,
      6,
    );
    expect((dano.previous7dUsd ?? 0) / 0.2).toBe(17_950_000);
    expect(dano.weekChangePct).toBeCloseTo(205.1597, 4);
  });

  it("refreshes live 7d without changing the retained Wednesday comparison", () => {
    const dashboard = buildMockDashboardData();
    dashboard.price.usd = 0.2;
    dashboard.dexes = [
      {
        ...dashboard.dexes[0],
        id: "wingriders-v2",
        name: "WingRiders V2",
        rowKind: "version",
        tableRole: "primary",
        parentId: "wingriders",
        protocolVersion: "V2",
        volume7dUsd: 1_000_000,
      },
    ];
    const current = getSeededWeeklySnapshot("2026-08-12");
    const previous = getSeededWeeklySnapshot("2026-08-05");
    const first = applyWeeklyReportingSnapshots(
      dashboard,
      current!,
      previous!,
    );

    dashboard.dexes[0].volume7dUsd = 1_100_000;
    const refreshed = applyWeeklyReportingSnapshots(
      dashboard,
      current!,
      previous!,
    );

    expect(refreshed.dexes[0].volume7dUsd).toBe(1_100_000);
    expect(refreshed.dexes[0].reportingVolume7dUsd).toBe(
      first.dexes[0].reportingVolume7dUsd,
    );
    expect(refreshed.dexes[0].previous7dUsd).toBe(
      first.dexes[0].previous7dUsd,
    );
    expect(refreshed.dexes[0].weekChangePct).toBe(
      first.dexes[0].weekChangePct,
    );
  });
});
