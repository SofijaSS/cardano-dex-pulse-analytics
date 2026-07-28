import { describe, expect, it } from "vitest";
import { createTablePdfBytes } from "@/lib/pdf-export";

describe("table PDF export", () => {
  it("creates a valid PDF document and paginates longer ranges", () => {
    const bytes = createTablePdfBytes({
      title: "Selected DEX volume range",
      subtitle: "Range: 30D | Currency: ADA",
      headers: ["Date", "Total", "Minswap"],
      rows: Array.from({ length: 30 }, (_, index) => [
        `2026-07-${String(index + 1).padStart(2, "0")}`,
        `${index + 1}M ADA`,
        `${index + 0.5}M ADA`,
      ]),
    });
    const pdf = new TextDecoder().decode(bytes);

    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("/Count 2");
    expect(pdf).toContain("Selected DEX volume range");
    expect(pdf.endsWith("%%EOF")).toBe(true);
  });
});
