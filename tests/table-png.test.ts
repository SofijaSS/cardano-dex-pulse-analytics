import { describe, expect, it } from "vitest";
import {
  calculateTablePngScale,
  selectTablePngRows,
  tablePngCellColor,
} from "@/lib/table-png";

describe("table PNG sizing", () => {
  it("exports only the first 10 filtered and sorted DEX rows", () => {
    const rows = Array.from({ length: 14 }, (_, index) => index + 1);

    expect(selectTablePngRows(rows)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("renders a compact table at enhanced Retina resolution", () => {
    expect(calculateTablePngScale(1_000, 500, 2)).toBe(3);
  });

  it("fits a wide 10-row table inside clipboard-safe dimensions", () => {
    const width = 3_200;
    const height = 584;
    const scale = calculateTablePngScale(width, height, 2);

    expect(Math.ceil(width * scale)).toBeLessThanOrEqual(6_144);
    expect(Math.ceil(height * scale)).toBeLessThanOrEqual(2_048);
    expect(Math.ceil(width * height * scale * scale)).toBeLessThanOrEqual(
      12_000_000,
    );
  });

  it("uses the active app theme colors for WoW changes only", () => {
    expect(tablePngCellColor("WoW change", "-73.9%", "dark")).toBe("#ff858a");
    expect(tablePngCellColor("WoW change", "+8.3%", "dark")).toBe("#59c99c");
    expect(tablePngCellColor("WoW change", "n/a", "dark")).toBe("#edf4f6");
    expect(tablePngCellColor("WoW change", "-73.9%", "light")).toBe("#c8494d");
    expect(tablePngCellColor("WoW change", "+8.3%", "light")).toBe("#14845c");
    expect(tablePngCellColor("24h volume", "-73.9%", "dark")).toBe("#edf4f6");
  });
});
