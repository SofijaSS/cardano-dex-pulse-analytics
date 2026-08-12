import { describe, expect, it } from "vitest";
import { buildMockDashboardData } from "../lib/mock-data";
import { buildWeeklyReportingSnapshot } from "../lib/weekly-reporting";
import {
  backfillWeeklyReportingPreviousState,
  rotateWeeklyReportingState,
  snapshotFromWeeklyState,
} from "../lib/weekly-state";

function snapshot(weekKey: string, capturedAt: string, volume7dUsd: number) {
  const dashboard = buildMockDashboardData();
  dashboard.dexes[0].volume7dUsd = volume7dUsd;
  return buildWeeklyReportingSnapshot(
    dashboard,
    weekKey,
    new Date(capturedAt),
  );
}

describe("bounded weekly reporting state", () => {
  it("rotates current into previous and never retains more than two weeks", () => {
    const august5 = snapshot(
      "2026-08-05",
      "2026-08-05T06:00:10Z",
      10_000,
    );
    const august12 = snapshot(
      "2026-08-12",
      "2026-08-12T06:00:10Z",
      8_000,
    );
    const august19 = snapshot(
      "2026-08-19",
      "2026-08-19T06:00:10Z",
      12_000,
    );

    const first = rotateWeeklyReportingState(null, august5);
    expect(first.current).toBe(august5);
    expect(first.previous).toBeNull();

    const second = rotateWeeklyReportingState(first, august12);
    expect(second.current).toBe(august12);
    expect(second.previous).toBe(august5);
    expect(snapshotFromWeeklyState(second, "2026-08-05")).toBe(august5);

    const third = rotateWeeklyReportingState(second, august19);
    expect(third.current).toBe(august19);
    expect(third.previous).toBe(august12);
    expect(snapshotFromWeeklyState(third, "2026-08-05")).toBeNull();
  });

  it("keeps the first capture immutable when the same week is delivered twice", () => {
    const firstCapture = snapshot(
      "2026-08-12",
      "2026-08-12T06:00:10Z",
      8_000,
    );
    const duplicateCapture = snapshot(
      "2026-08-12",
      "2026-08-12T06:15:00Z",
      9_000,
    );

    const state = rotateWeeklyReportingState(null, firstCapture);
    expect(rotateWeeklyReportingState(state, duplicateCapture)).toBe(state);
    expect(state.current?.dexes.minswap.volume7dUsd).toBe(8_000);
  });

  it("rejects a capture older than the current week", () => {
    const current = snapshot(
      "2026-08-12",
      "2026-08-12T06:00:10Z",
      8_000,
    );
    const older = snapshot(
      "2026-08-05",
      "2026-08-05T06:00:10Z",
      10_000,
    );

    const state = rotateWeeklyReportingState(null, current);
    expect(() => rotateWeeklyReportingState(state, older)).toThrow(
      /older than current/,
    );
  });

  it("backfills only the immediately previous empty slot", () => {
    const august5 = snapshot(
      "2026-08-05",
      "2026-08-05T06:00:10Z",
      10_000,
    );
    const august12 = snapshot(
      "2026-08-12",
      "2026-08-12T06:00:10Z",
      8_000,
    );
    const state = rotateWeeklyReportingState(null, august12);

    const backfilled = backfillWeeklyReportingPreviousState(state, august5);
    expect(backfilled.current).toBe(august12);
    expect(backfilled.previous).toBe(august5);
    expect(backfillWeeklyReportingPreviousState(backfilled, august5)).toBe(
      backfilled,
    );
  });

  it("rejects a backfill that is not the immediately previous week", () => {
    const july29 = snapshot(
      "2026-07-29",
      "2026-07-29T06:00:10Z",
      10_000,
    );
    const august12 = snapshot(
      "2026-08-12",
      "2026-08-12T06:00:10Z",
      8_000,
    );
    const state = rotateWeeklyReportingState(null, august12);

    expect(() =>
      backfillWeeklyReportingPreviousState(state, july29),
    ).toThrow(/does not match expected previous week/);
  });
});
