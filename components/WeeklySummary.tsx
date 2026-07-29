"use client";

import { useState } from "react";
import { Check, Copy, Printer } from "lucide-react";
import { PreserveTerms } from "@/components/PreserveTerms";
import {
  formatDateTime,
  formatMoney,
  formatPercent,
  formatRatio,
  type Currency,
} from "@/lib/format";
import type { DexMetric } from "@/lib/types";
import { buildWeeklyReportModel } from "@/lib/weekly-report";

export function WeeklySummary({
  dexes,
  currency,
  adaPriceUsd,
  generatedAt,
}: {
  dexes: DexMetric[];
  currency: Currency;
  adaPriceUsd: number | null;
  generatedAt: string;
}) {
  const [copied, setCopied] = useState(false);
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

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="wing-section print-report" id="weekly-report">
      <div className="wing-orbit" aria-hidden="true"><span /></div>
      <div className="section-heading wing-heading">
        <div>
          <span className="eyebrow eyebrow--light"><PreserveTerms>{selectedDex?.name || "DEX"}</PreserveTerms> focus</span>
          <h2>Weekly performance brief</h2>
          <p>Select any current top-three table entry to update the weekly report.</p>
        </div>
        <div className="weekly-actions no-print">
          <button type="button" className="button button--ghost-light" onClick={copySummary}>
            {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
            {copied ? "Copied" : "Copy summary"}
          </button>
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
                setCopied(false);
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
