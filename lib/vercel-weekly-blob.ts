import type { WeeklyReportingSnapshot } from "@/lib/weekly-reporting";
import {
  isWeeklyReportingState,
  rotateWeeklyReportingState,
  type WeeklyReportingState,
} from "@/lib/weekly-state";

export const WEEKLY_REPORTING_BLOB_PATH =
  process.env.WEEKLY_REPORTING_BLOB_PATH ??
  "cardano-dex-pulse/weekly-reporting-state.json";

const MAX_WRITE_ATTEMPTS = 3;

function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim() || null;
}

interface ReadBlobState {
  state: WeeklyReportingState | null;
  etag: string | null;
}

async function readBlobState(token: string): Promise<ReadBlobState> {
  const { get } = await import("@vercel/blob");
  const result = await get(WEEKLY_REPORTING_BLOB_PATH, {
    access: "private",
    token,
  });
  if (!result) return { state: null, etag: null };
  if (result.statusCode !== 200 || !result.stream) {
    throw new Error(
      `Weekly reporting Blob returned unexpected status ${result.statusCode}.`,
    );
  }

  const payload = (await new Response(result.stream).json()) as unknown;
  if (!isWeeklyReportingState(payload)) {
    throw new Error("Weekly reporting Blob contains an invalid state payload.");
  }
  return { state: payload, etag: result.blob.etag };
}

export async function readVercelWeeklyReportingState(): Promise<
  WeeklyReportingState | null | undefined
> {
  const token = blobToken();
  if (!token) return undefined;
  return (await readBlobState(token)).state;
}

export async function rotateVercelWeeklyReportingSnapshot(
  snapshot: WeeklyReportingSnapshot,
): Promise<WeeklyReportingState | undefined> {
  const token = blobToken();
  if (!token) return undefined;
  const blob = await import("@vercel/blob");

  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    const current = await readBlobState(token);
    const nextState = rotateWeeklyReportingState(current.state, snapshot);
    if (nextState === current.state) return current.state;

    try {
      await blob.put(WEEKLY_REPORTING_BLOB_PATH, JSON.stringify(nextState), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: current.etag !== null,
        cacheControlMaxAge: 60,
        contentType: "application/json; charset=utf-8",
        token,
        ...(current.etag ? { ifMatch: current.etag } : {}),
      });
      return nextState;
    } catch (error) {
      if (
        (error instanceof blob.BlobPreconditionFailedError || !current.etag) &&
        attempt < MAX_WRITE_ATTEMPTS
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Weekly reporting Blob could not be updated safely.");
}
