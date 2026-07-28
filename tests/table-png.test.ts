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
});
