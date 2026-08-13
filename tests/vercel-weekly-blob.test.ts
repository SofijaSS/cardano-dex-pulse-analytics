import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMockDashboardData } from "../lib/mock-data";
import { buildWeeklyReportingSnapshot } from "../lib/weekly-reporting";
import { rotateWeeklyReportingState } from "../lib/weekly-state";

const blobMock = vi.hoisted(() => {
  class BlobPreconditionFailedError extends Error {}
  class BlobNotFoundError extends Error {}
  return {
    BlobNotFoundError,
    BlobPreconditionFailedError,
    get: vi.fn(),
    head: vi.fn(),
    put: vi.fn(),
  };
});

vi.mock("@vercel/blob", () => blobMock);

import {
  backfillVercelWeeklyReportingCurrentMissingValues,
  backfillVercelWeeklyReportingPreviousSnapshot,
  rotateVercelWeeklyReportingSnapshot,
} from "../lib/vercel-weekly-blob";

function snapshot(weekKey: string, capturedAt: string) {
  return buildWeeklyReportingSnapshot(
    buildMockDashboardData(),
    weekKey,
    new Date(capturedAt),
  );
}

function storedBlob(state: unknown, etag: string) {
  return {
    blob: { etag },
    statusCode: 200,
    stream: new Response(JSON.stringify(state)).body,
  };
}

describe("Vercel Blob weekly reporting adapter", () => {
  beforeEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    blobMock.get.mockReset();
    blobMock.head.mockReset();
    blobMock.put.mockReset();
  });

  afterEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it("creates one private bounded state object without allowing overwrite", async () => {
    const august12 = snapshot("2026-08-12", "2026-08-12T06:00:10Z");
    blobMock.get.mockResolvedValue(null);
    blobMock.head.mockRejectedValue(new blobMock.BlobNotFoundError());
    blobMock.put.mockResolvedValue({});

    const state = await rotateVercelWeeklyReportingSnapshot(august12);

    expect(state).toMatchObject({ current: august12, previous: null });
    expect(blobMock.get).toHaveBeenCalledWith(
      "cardano-dex-pulse/weekly-reporting-state.json",
      expect.objectContaining({
        access: "private",
        token: "test-token",
        useCache: false,
      }),
    );
    expect(blobMock.put).toHaveBeenCalledWith(
      "cardano-dex-pulse/weekly-reporting-state.json",
      expect.any(String),
      expect.objectContaining({
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
      }),
    );
  });

  it("uses the current ETag while rotating the prior week", async () => {
    const august5 = snapshot("2026-08-05", "2026-08-05T06:00:10Z");
    const august12 = snapshot("2026-08-12", "2026-08-12T06:00:10Z");
    const existing = rotateWeeklyReportingState(null, august5);
    blobMock.get.mockResolvedValue(storedBlob(existing, "stale-cdn-etag"));
    blobMock.head.mockResolvedValue({ etag: "etag-august-5" });
    blobMock.put.mockResolvedValue({});

    const state = await rotateVercelWeeklyReportingSnapshot(august12);

    expect(state).toMatchObject({ current: august12, previous: august5 });
    expect(blobMock.put).toHaveBeenCalledWith(
      "cardano-dex-pulse/weekly-reporting-state.json",
      expect.any(String),
      expect.objectContaining({
        allowOverwrite: true,
        ifMatch: "etag-august-5",
      }),
    );
  });

  it("backfills the previous slot without replacing current", async () => {
    const august5 = snapshot("2026-08-05", "2026-08-05T06:00:10Z");
    const august12 = snapshot("2026-08-12", "2026-08-12T06:00:10Z");
    const existing = rotateWeeklyReportingState(null, august12);
    blobMock.get.mockResolvedValue(storedBlob(existing, "stale-cdn-etag"));
    blobMock.head.mockResolvedValue({ etag: "etag-august-12" });
    blobMock.put.mockResolvedValue({});

    const state =
      await backfillVercelWeeklyReportingPreviousSnapshot(august5);

    expect(state).toMatchObject({ current: august12, previous: august5 });
    expect(blobMock.put).toHaveBeenCalledWith(
      "cardano-dex-pulse/weekly-reporting-state.json",
      expect.any(String),
      expect.objectContaining({
        allowOverwrite: true,
        ifMatch: "etag-august-12",
      }),
    );
  });

  it("fills a missing current metric without replacing captured values", async () => {
    const august12 = snapshot("2026-08-12", "2026-08-12T06:00:10Z");
    august12.dexes["dano-finance"] = {
      weekChangePct: null,
      volume7dAda: null,
      volume7dUsd: null,
    };
    const reviewed = snapshot("2026-08-12", "2026-08-12T06:00:10Z");
    reviewed.dexes.minswap.volume7dUsd = 999_999;
    reviewed.dexes["dano-finance"] = {
      weekChangePct: null,
      volume7dAda: 54_776_167.717773,
      volume7dUsd: null,
    };
    const existing = rotateWeeklyReportingState(null, august12);
    const capturedMinswap = existing.current?.dexes.minswap.volume7dUsd;
    blobMock.get.mockResolvedValue(storedBlob(existing, "stale-cdn-etag"));
    blobMock.head.mockResolvedValue({ etag: "etag-august-12" });
    blobMock.put.mockResolvedValue({});

    const state =
      await backfillVercelWeeklyReportingCurrentMissingValues(reviewed);

    expect(state?.current?.dexes["dano-finance"].volume7dAda).toBeCloseTo(
      54_776_167.717773,
      6,
    );
    expect(state?.current?.dexes.minswap.volume7dUsd).toBe(capturedMinswap);
    expect(blobMock.put).toHaveBeenCalledWith(
      "cardano-dex-pulse/weekly-reporting-state.json",
      expect.any(String),
      expect.objectContaining({
        allowOverwrite: true,
        ifMatch: "etag-august-12",
      }),
    );
  });
});
