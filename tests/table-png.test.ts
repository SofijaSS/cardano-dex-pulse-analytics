import { describe, expect, it } from "vitest";
import { calculateTablePngScale } from "@/lib/table-png";

describe("table PNG sizing", () => {
  it("keeps a compact table at full Retina resolution", () => {
    expect(calculateTablePngScale(1_000, 500, 2)).toBe(2);
  });

  it("fits a full 19-row table inside clipboard-safe dimensions", () => {
    const width = 3_200;
    const height = 908;
    const scale = calculateTablePngScale(width, height, 2);

    expect(Math.ceil(width * scale)).toBeLessThanOrEqual(4_096);
    expect(Math.ceil(height * scale)).toBeLessThanOrEqual(1_024);
    expect(Math.ceil(width * height * scale * scale)).toBeLessThanOrEqual(
      4_000_000,
    );
  });
});
