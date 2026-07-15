"use client";

import { useState } from "react";
import { Check, Copy, Printer } from "lucide-react";
import {
  formatDateTime,
  formatMoney,
  formatPercent,
  formatRatio,
  type Currency,
} from "@/lib/format";
import type { DexMetric } from "@/lib/types";

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
  const wingriders = dexes.find((dex) => dex.id === "wingriders") || null;
  const ranked = dexes
    .filter((dex) => dex.volume7dUsd != null)
    .sort((a, b) => (b.volume7dUsd || 0) - (a.volume7dUsd || 0));
  const topThree = ranked.slice(0, 3);
  const observed7d = ranked.reduce((sum, dex) => sum + (dex.volume7dUsd || 0), 0);
  const share7d =
    wingriders?.volume7dUsd != null && observed7d > 0
      ? (wingriders.volume7dUsd / observed7d) * 100
      : null;
  const difference =
    wingriders?.volume7dUsd != null && wingriders.previous7dUsd != null
      ? wingriders.volume7dUsd - wingriders.previous7dUsd
      : null;

  let summary =
    "WingRiders weekly summary: Data unavailable from the configured verified sources.";
  if (wingriders?.volume7dUsd != null) {
    summary = `WingRiders recorded ${formatMoney(wingriders.volume7dUsd, currency, adaPriceUsd, false)} in weekly volume`;
    if (wingriders.weekChangePct != null) {
      summary += `, representing a ${formatPercent(wingriders.weekChangePct)} change compared with the previous week`;
    }
    summary += ".";
    if (share7d != null && wingriders.rank7d != null) {
      summary += ` Its share of comparable reported 7-day volume was ${share7d.toFixed(1)}%, ranking it #${wingriders.rank7d} among DEXes with available weekly data.`;
    }
  }

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
          <span className="eyebrow eyebrow--light">WingRiders focus</span>
          <h2>Weekly performance brief</h2>
          <p>Native current data with DefiLlama history only where the live reconciliation check passes.</p>
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
          <article><span>24h volume</span><strong>{formatMoney(wingriders?.volume24hUsd, currency, adaPriceUsd)}</strong></article>
          <article><span>7d volume</span><strong>{formatMoney(wingriders?.volume7dUsd, currency, adaPriceUsd)}</strong></article>
          <article><span>30d volume</span><strong>{formatMoney(wingriders?.volume30dUsd, currency, adaPriceUsd)}</strong></article>
          <article><span>Week change</span><strong className={(wingriders?.weekChangePct || 0) >= 0 ? "positive" : "negative"}>{formatPercent(wingriders?.weekChangePct)}</strong></article>
          <article><span>Comparable 7d share</span><strong>{formatPercent(share7d, false)}</strong></article>
          <article><span>Rank by 7d volume</span><strong>{wingriders?.rank7d ? `#${wingriders.rank7d}` : "N/A"}</strong></article>
          <article><span>TVL</span><strong>{formatMoney(wingriders?.tvlUsd, currency, adaPriceUsd)}</strong></article>
          <article><span>24h volume / TVL</span><strong>{formatRatio(wingriders?.volumeToTvl)}</strong></article>
          <article><span>vs previous week</span><strong>{formatMoney(difference, currency, adaPriceUsd)}</strong></article>
        </div>

        <div className="weekly-copy">
          <span>Auto-generated weekly summary</span>
          <blockquote>{summary}</blockquote>
          <small>Generated {formatDateTime(generatedAt)} UTC. Share is based only on DEXes with comparable 7-day values.</small>
        </div>
      </div>

      <div className="top-three">
        <span>Position vs top three</span>
        <div>
          {topThree.map((dex, index) => (
            <article key={dex.id} className={dex.id === "wingriders" ? "is-wingriders" : ""}>
              <span>#{index + 1}</span>
              <i style={{ background: dex.color }} />
              <strong>{dex.name}</strong>
              <small>{formatMoney(dex.volume7dUsd, currency, adaPriceUsd)}</small>
            </article>
          ))}
          {wingriders && !topThree.some((dex) => dex.id === "wingriders") ? (
            <article className="is-wingriders">
              <span>{wingriders.rank7d ? `#${wingriders.rank7d}` : "–"}</span>
              <i style={{ background: wingriders.color }} />
              <strong>WingRiders</strong>
              <small>{formatMoney(wingriders.volume7dUsd, currency, adaPriceUsd)}</small>
            </article>
          ) : null}
        </div>
      </div>
    </section>
  );
}
