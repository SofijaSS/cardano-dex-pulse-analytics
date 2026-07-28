import { describe, expect, it } from "vitest";
import {
  calculateTablePngScale,
  selectTablePngRows,
} from "@/lib/table-png";

describe("table PNG sizing", () => {
  it("exports only the first 10 filtered and sorted DEX rows", () => {
    const rows = Array.from({ length: 14 }, (_, index) => index + 1);

    expect(selectTablePngRows(rows)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("keeps a compact table at full Retina resolution", () => {
    expect(calculateTablePngScale(1_000, 500, 2)).toBe(2);
  });

  it("fits a wide 10-row table inside clipboard-safe dimensions", () => {
    const width = 3_200;
    const height = 584;
    const scale = calculateTablePngScale(width, height, 2);

    expect(Math.ceil(width * scale)).toBeLessThanOrEqual(4_096);
    expect(Math.ceil(height * scale)).toBeLessThanOrEqual(1_024);
    expect(Math.ceil(width * height * scale * scale)).toBeLessThanOrEqual(
      4_000_000,
    );
  });
});
