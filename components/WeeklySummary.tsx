"use client";

import { useState } from "react";
import { Camera, Check, Printer } from "lucide-react";
import { PreserveTerms } from "@/components/PreserveTerms";
import {
  formatDateTime,
  formatMoney,
  formatPercent,
  formatRatio,
  type Currency,
} from "@/lib/format";
import type { DexMetric, WeeklyReportingStatus } from "@/lib/types";
import { buildWeeklyReportModel } from "@/lib/weekly-report";
import { copyWeeklyReportAsPng } from "@/lib/weekly-report-png";

export function WeeklySummary({
  dexes,
  currency,
  adaPriceUsd,
  generatedAt,
  weeklyReporting,
}: {
  dexes: DexMetric[];
  currency: Currency;
  adaPriceUsd: number | null;
  generatedAt: string;
  weeklyReporting?: WeeklyReportingStatus;
}) {
  const [pngStatus, setPngStatus] = useState<
    "idle" | "working" | "copied" | "downloaded" | "error"
  >("idle");
  const [selectedDexId, setSelectedDexId] = useState<string | null>(null);
  const { topThree, selectedDex, rank } =
    buildWeeklyReportModel(dexes, selectedDexId);

  let summary =
    "Weekly summary: Data unavailable from the configured verified sources.";
  if (selectedDex?.volume7dUsd != null) {
    summary = `${selectedDex.name} recorded ${formatMoney(selectedDex.volume7dUsd, currency, adaPriceUsd)} in 7-day volume`;
    if (selectedDex.previous7dUsd != null) {
      summary += `, compared with ${formatMoney(selectedDex.previous7dUsd, currency, adaPriceUsd)} in the previous period`;
    }
    if (selectedDex.weekChangePct != null) {
      summary += `, a change of ${formatPercent(selectedDex.weekChangePct)}`;
    }
    summary += ".";
    if (rank != null) {
      summary += ` It ranks #${rank} in the current DEX performance table`;
      if (selectedDex.marketShare24hPct != null) {
        summary += ` and represents ${formatPercent(selectedDex.marketShare24hPct, false)} of reported 24-hour volume`;
      }
      summary += ".";
    } else if (selectedDex.marketShare24hPct != null) {
      summary += ` It represents ${formatPercent(selectedDex.marketShare24hPct, false)} of reported 24-hour volume.`;
    }
  }

  const changeClass =
    selectedDex?.weekChangePct == null
      ? undefined
      : selectedDex.weekChangePct >= 0
        ? "positive"
        : "negative";

  const copyWeeklyReportPng = async () => {
    if (!selectedDex) return;
    setPngStatus("working");
    try {
      const result = await copyWeeklyReportAsPng({
        filename: `cardano-dex-weekly-${selectedDex.id}-${new Date().toISOString().slice(0, 10)}.png`,
        focus: `${selectedDex.name} focus`,
        title: "Weekly performance brief",
        subtitle: "Current top-three table entry with matching DEX performance metrics.",
        metrics: [
          { label: "24h volume", value: formatMoney(selectedDex.volume24hUsd, currency, adaPriceUsd) },
          { label: "7d volume", value: formatMoney(selectedDex.volume7dUsd, currency, adaPriceUsd) },
          { label: "30d volume", value: formatMoney(selectedDex.volume30dUsd, currency, adaPriceUsd) },
          { label: "Previous 7d", value: formatMoney(selectedDex.previous7dUsd, currency, adaPriceUsd) },
          {
            label: "WoW",
            value: formatPercent(selectedDex.weekChangePct),
            tone:
              selectedDex.weekChangePct == null
                ? undefined
                : selectedDex.weekChangePct >= 0
                  ? "positive"
                  : "negative",
          },
          { label: "7d rank", value: rank ? `#${rank}` : "N/A" },
          { label: "TVL", value: formatMoney(selectedDex.tvlUsd, currency, adaPriceUsd) },
          { label: "Volume / TVL", value: formatRatio(selectedDex.volumeToTvl) },
          { label: "24h share", value: formatPercent(selectedDex.marketShare24hPct, false) },
        ],
        summary,
        sourceLine: `Last data ${formatDateTime(selectedDex.lastDataAt)} · ${selectedDex.sourceLabel}`,
        generatedLine: `Report generated ${formatDateTime(generatedAt)}.`,
        topThree: topThree.map((dex, index) => ({
          rank: index + 1,
          name: dex.name,
          value: formatMoney(dex.volume7dUsd, currency, adaPriceUsd),
          color: dex.color,
          selected: dex.id === selectedDex.id,
        })),
      });
      setPngStatus(result);
    } catch {
      setPngStatus("error");
    }
    window.setTimeout(() => setPngStatus("idle"), 2_400);
  };

  const pngStatusLabel =
    pngStatus === "working"
      ? "Preparing high-resolution PNG"
      : pngStatus === "copied"
        ? "PNG copied"
        : pngStatus === "downloaded"
          ? "PNG downloaded"
          : pngStatus === "error"
            ? "Copy failed"
            : "Copy weekly performance brief as high-resolution PNG";

  return (
    <section className="wing-section print-report" id="weekly-report">
      <div className="wing-orbit" aria-hidden="true"><span /></div>
      <div className="section-heading wing-heading">
        <div>
          <span className="eyebrow eyebrow--light"><PreserveTerms>{selectedDex?.name || "DEX"}</PreserveTerms> focus</span>
          <h2>Weekly performance brief</h2>
          <p>{weeklyReporting ? `7d reporting is frozen at the ${weeklyReporting.currentWeekKey} Wednesday snapshot; Previous 7d uses ${weeklyReporting.previousWeekKey}.` : "Select any current top-three table entry to update the weekly report."}</p>
        </div>
        <div className="weekly-actions no-print">
          <div className="table-copy-control weekly-png-control">
            <button
              type="button"
              className={`table-copy-button table-copy-button--${pngStatus}`}
              aria-label="Copy weekly performance brief as high-resolution PNG"
              title={pngStatusLabel}
              disabled={pngStatus === "working" || !selectedDex}
              onClick={copyWeeklyReportPng}
            >
              {pngStatus === "copied" || pngStatus === "downloaded"
                ? <Check size={16} aria-hidden="true" />
                : <Camera size={16} aria-hidden="true" />}
            </button>
            {pngStatus !== "idle" ? (
              <span className="table-copy-status" role="status">{pngStatusLabel}</span>
            ) : null}
          </div>
          <button type="button" className="button button--light" onClick={() => window.print()}>
            <Printer size={15} aria-hidden="true" />
            Print / Save PDF
          </button>
        </div>
      </div>

      <div className="wing-grid">
        <div className="wing-metrics">
          <article><span>24h volume</span><strong><PreserveTerms>{formatMoney(selectedDex?.volume24hUsd, currency, adaPriceUsd)}</PreserveTerms></strong></article>
          <article><span>7d volume</span><strong><PreserveTerms>{formatMoney(selectedDex?.volume7dUsd, currency, adaPriceUsd)}</PreserveTerms></strong></article>
          <article><span>30d volume</span><strong><PreserveTerms>{formatMoney(selectedDex?.volume30dUsd, currency, adaPriceUsd)}</PreserveTerms></strong></article>
          <article><span>Previous 7d</span><strong><PreserveTerms>{formatMoney(selectedDex?.previous7dUsd, currency, adaPriceUsd)}</PreserveTerms></strong></article>
          <article><span>WoW</span><strong className={changeClass}>{formatPercent(selectedDex?.weekChangePct)}</strong></article>
          <article><span>7d rank</span><strong>{rank ? `#${rank}` : "N/A"}</strong></article>
          <article><span>TVL</span><strong><PreserveTerms>{formatMoney(selectedDex?.tvlUsd, currency, adaPriceUsd)}</PreserveTerms></strong></article>
          <article><span>Volume / TVL</span><strong>{formatRatio(selectedDex?.volumeToTvl)}</strong></article>
          <article><span>24h share</span><strong>{formatPercent(selectedDex?.marketShare24hPct, false)}</strong></article>
        </div>

        <div className="weekly-copy" aria-live="polite">
          <span>Auto-generated weekly summary</span>
          <blockquote><PreserveTerms>{summary}</PreserveTerms></blockquote>
          <div className="weekly-copy__meta">
            <small>
              Last data {formatDateTime(selectedDex?.lastDataAt)} ·{" "}
              <PreserveTerms>{selectedDex?.sourceLabel || "Data unavailable"}</PreserveTerms>
            </small>
            <small>Report generated {formatDateTime(generatedAt)}.</small>
            {weeklyReporting ? (
              <small>Weekly cutoff Wednesday 08:00 Europe/Belgrade · snapshot {formatDateTime(weeklyReporting.currentCapturedAt)}.</small>
            ) : null}
          </div>
        </div>
      </div>

      <div className="top-three">
        <span>Select a top-three table entry</span>
        <div>
          {topThree.map((dex, index) => (
            <button
              type="button"
              key={dex.id}
              className={dex.id === selectedDex?.id ? "is-selected" : ""}
              aria-pressed={dex.id === selectedDex?.id}
              onClick={() => {
                setSelectedDexId(dex.id);
                setPngStatus("idle");
              }}
            >
              <span>#{index + 1}</span>
              <i style={{ background: dex.color }} />
              <strong><PreserveTerms>{dex.name}</PreserveTerms></strong>
              <small><PreserveTerms>{formatMoney(dex.volume7dUsd, currency, adaPriceUsd)}</PreserveTerms></small>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
