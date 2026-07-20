export type Currency = "USD" | "ADA";

export const CENTRAL_EUROPE_TIME_ZONE = "Europe/Belgrade";

export function convertUsd(
  value: number | null | undefined,
  currency: Currency,
  adaPriceUsd: number | null,
) {
  if (value == null || !Number.isFinite(value)) return null;
  if (currency === "USD") return value;
  if (!adaPriceUsd || adaPriceUsd <= 0) return null;
  return value / adaPriceUsd;
}

export function formatMoney(
  value: number | null | undefined,
  currency: Currency,
  adaPriceUsd: number | null,
  compact = true,
) {
  const converted = convertUsd(value, currency, adaPriceUsd);
  if (converted == null) return "Data unavailable";

  const formatter = new Intl.NumberFormat("en-US", {
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 2 : 0,
  });
  const sign = converted < 0 ? "-" : "";
  const formatted = formatter.format(Math.abs(converted));
  return currency === "USD"
    ? `${sign}$${formatted}`
    : `${sign}${formatted} ADA`;
}

export function formatPercent(
  value: number | null | undefined,
  signed = true,
) {
  if (value == null || !Number.isFinite(value)) return "N/A";
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function formatRatio(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `${value.toFixed(value < 0.1 ? 3 : 2)}x`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "Data unavailable";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Data unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: CENTRAL_EUROPE_TIME_ZONE,
    timeZoneName: "short",
  }).format(date);
}

export function escapeCsv(value: unknown) {
  const stringValue = value == null ? "" : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
}

export function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
