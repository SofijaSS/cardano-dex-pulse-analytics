"use client";

import { useState } from "react";
import { Check, Copy, Printer } from "lucide-react";
import { PreserveAda } from "@/components/PreserveAda";
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
  const [selectedDexId, setSelectedDexId] = useState<string | null>("wingriders");
  const { topThree, selectedDex, share7d, difference, rank } =
    buildWeeklyReportModel(dexes, selectedDexId);

  let summary =
    "Weekly summary: Data unavailable from the configured verified sources.";
  if (selectedDex?.volume7dUsd != null) {
    summary = `${selectedDex.name} recorded ${formatMoney(selectedDex.volume7dUsd, currency, adaPriceUsd, false)} in weekly volume`;
    if (selectedDex.weekChangePct != null) {
      summary += `, representing a ${formatPercent(selectedDex.weekChangePct)} change compared with the previous week`;
    }
    summary += ".";
    if (share7d != null && rank != null) {
      summary += ` Its share of comparable reported 7-day volume was ${share7d.toFixed(1)}%, ranking it #${rank} among DEXes with available weekly data.`;
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
          <span className="eyebrow eyebrow--light">{selectedDex?.name || "DEX"} focus</span>
          <h2>Weekly performance brief</h2>
          <p>Select any current top-three DEX to update the full weekly report.</p>
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
          <article><span>24h volume</span><strong><PreserveAda>{formatMoney(selectedDex?.volume24hUsd, currency, adaPriceUsd)}</PreserveAda></strong></article>
          <article><span>7d volume</span><strong><PreserveAda>{formatMoney(selectedDex?.volume7dUsd, currency, adaPriceUsd)}</PreserveAda></strong></article>
          <article><span>30d volume</span><strong><PreserveAda>{formatMoney(selectedDex?.volume30dUsd, currency, adaPriceUsd)}</PreserveAda></strong></article>
          <article><span>Week change</span><strong className={changeClass}>{formatPercent(selectedDex?.weekChangePct)}</strong></article>
          <article><span>Comparable 7d share</span><strong>{formatPercent(share7d, false)}</strong></article>
          <article><span>Rank by 7d volume</span><strong>{rank ? `#${rank}` : "N/A"}</strong></article>
          <article><span>TVL</span><strong><PreserveAda>{formatMoney(selectedDex?.tvlUsd, currency, adaPriceUsd)}</PreserveAda></strong></article>
          <article><span>24h volume / TVL</span><strong>{formatRatio(selectedDex?.volumeToTvl)}</strong></article>
          <article><span>vs previous week</span><strong><PreserveAda>{formatMoney(difference, currency, adaPriceUsd)}</PreserveAda></strong></article>
        </div>

        <div className="weekly-copy" aria-live="polite">
          <span>Auto-generated weekly summary</span>
          <blockquote><PreserveAda>{summary}</PreserveAda></blockquote>
          <small>Generated {formatDateTime(generatedAt)}. Share is based only on DEXes with comparable 7-day values.</small>
        </div>
      </div>

      <div className="top-three">
        <span>Select a top-three DEX</span>
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
              <strong>{dex.name}</strong>
              <small><PreserveAda>{formatMoney(dex.volume7dUsd, currency, adaPriceUsd)}</PreserveAda></small>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
