"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/ChartCard";
import { safePercentageShares } from "@/lib/calculations";
import { CENTRAL_EUROPE_TIME_ZONE, convertUsd, formatMoney, type Currency } from "@/lib/format";
import type { DexMetric, VolumeSeriesPoint } from "@/lib/types";

const gridColor = "var(--chart-grid)";
const axisColor = "var(--chart-axis)";

function EmptyChart({ message }: { message: string }) {
  return <div className="empty-chart">{message}</div>;
}

function dateLabel(timestamp: number) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: CENTRAL_EUROPE_TIME_ZONE,
  }).format(new Date(timestamp * 1000));
}

export function DashboardCharts({
  series,
  dexes,
  selected,
  currency,
  adaPriceUsd,
}: {
  series: VolumeSeriesPoint[];
  dexes: DexMetric[];
  selected: Set<string>;
  currency: Currency;
  adaPriceUsd: number | null;
}) {
  const selectedDexes = dexes.filter((dex) => selected.has(dex.id));
  const convertedSeries = series.map((point) => ({
    timestamp: point.timestamp,
    total: convertUsd(point.totalUsd, currency, adaPriceUsd) || 0,
    ...Object.fromEntries(
      selectedDexes.map((dex) => [
        dex.id,
        convertUsd(point.byDex[dex.id] || 0, currency, adaPriceUsd) || 0,
      ]),
    ),
  }));
  const unitFormatter = (value: unknown) =>
    formatMoney(Number(value), currency, currency === "USD" ? null : 1, true);
  const tooltipFormatter = (value: unknown) => unitFormatter(value);
  const shareRows = dexes
    .filter((dex) => (dex.volume24hUsd || 0) > 0)
    .sort((a, b) => (b.volume24hUsd || 0) - (a.volume24hUsd || 0));
  const sharePercentages = safePercentageShares(
    shareRows.map((dex) => dex.volume24hUsd),
  );
  const pieData = shareRows
    .map((dex) => ({
      name: dex.name,
      value: convertUsd(dex.volume24hUsd, currency, adaPriceUsd) || 0,
      color: dex.color,
    }));
  const marketShareData = shareRows.map((dex, index) => ({
    name: dex.name,
    value: sharePercentages[index] || 0,
    color: dex.color,
  }));
  const weeklyData = dexes
    .filter((dex) => dex.volume7dUsd != null && dex.previous7dUsd != null)
    .slice(0, 8)
    .map((dex) => ({
      name: dex.name,
      current: convertUsd(dex.volume7dUsd, currency, adaPriceUsd) || 0,
      previous: convertUsd(dex.previous7dUsd, currency, adaPriceUsd) || 0,
    }));
  const efficiencyData = dexes
    .filter((dex) => dex.volumeToTvl != null)
    .slice(0, 9)
    .map((dex) => ({ name: dex.name, value: dex.volumeToTvl, color: dex.color }));
  const tvlData = dexes
    .filter((dex) => dex.tvlUsd != null && dex.tvlUsd > 0)
    .sort((a, b) => (b.tvlUsd || 0) - (a.tvlUsd || 0))
    .slice(0, 9)
    .map((dex) => ({
      name: dex.name,
      value: convertUsd(dex.tvlUsd, currency, adaPriceUsd) || 0,
      color: dex.color,
    }));

  return (
    <div className="charts-grid">
      <ChartCard
        className="chart-card--wide"
        eyebrow="Historical benchmark"
        title="Total Cardano DEX volume over time"
        note="DefiLlama daily benchmark. Native APIs do not expose one aligned ecosystem-wide historical series, so this chart is intentionally not labelled reconciled."
      >
        {!convertedSeries.length ? (
          <EmptyChart message="Historical benchmark data unavailable." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={convertedSeries} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1b5cff" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#1b5cff" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={gridColor} vertical={false} />
              <XAxis dataKey="timestamp" tickFormatter={dateLabel} tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={28} />
              <YAxis tickFormatter={(value) => unitFormatter(value)} tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} width={78} />
              <Tooltip formatter={tooltipFormatter} labelFormatter={(value) => dateLabel(Number(value))} />
              <Area type="monotone" dataKey="total" name="Total benchmark" stroke="#1b5cff" strokeWidth={2.5} fill="url(#totalGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard
        className="chart-card--wide"
        eyebrow="DEX breakdown"
        title="Volume by DEX over time"
        note="Daily DefiLlama breakdown; use the DEX chips above to show or hide series. Native-only DEXes can be absent from this benchmark history."
      >
        {!convertedSeries.length || !selectedDexes.length ? (
          <EmptyChart message="Select at least one DEX with historical benchmark data." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={convertedSeries} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={gridColor} vertical={false} />
              <XAxis dataKey="timestamp" tickFormatter={dateLabel} tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={28} />
              <YAxis tickFormatter={(value) => unitFormatter(value)} tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} width={78} />
              <Tooltip formatter={tooltipFormatter} labelFormatter={(value) => dateLabel(Number(value))} />
              <Legend iconType="circle" />
              {selectedDexes.map((dex) => (
                <Area key={dex.id} type="monotone" dataKey={dex.id} name={dex.name} stackId="volume" stroke={dex.color} fill={dex.color} fillOpacity={0.45} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard
        eyebrow="Reconciled snapshot"
        title="Current market share in %"
        note="Percentage of current 24h volume across DEXes with positive available data in the active view. The displayed shares sum to 100% within this available cohort."
      >
        {!marketShareData.length ? (
          <EmptyChart message="Current market share percentage data unavailable." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={marketShareData} layout="vertical" margin={{ top: 4, right: 24, left: 12, bottom: 0 }}>
              <CartesianGrid stroke={gridColor} horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${Number(value).toFixed(0)}%`} tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={86} tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
              <Bar dataKey="value" name="Observed 24h share" radius={[0, 6, 6, 0]}>
                {marketShareData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard
        eyebrow="Reconciled snapshot"
        title="Current market share"
        note="Current 24h volume distribution across DEXes with available data in the active view. This is not presented as complete Cardano market coverage."
      >
        {!pieData.length ? (
          <EmptyChart message="Current market share data unavailable." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="82%" paddingAngle={2}>
                {pieData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={tooltipFormatter} />
              <Legend iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard
        eyebrow="Comparable cohort"
        title="Week-over-week volume"
        note="Only DEXes with both current and previous 7-day values from native or runtime-validated sources are included."
      >
        {!weeklyData.length ? (
          <EmptyChart message="Comparable weekly data unavailable." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyData} margin={{ top: 10, right: 8, left: 0, bottom: 42 }}>
              <CartesianGrid stroke={gridColor} vertical={false} />
              <XAxis dataKey="name" angle={-28} textAnchor="end" interval={0} tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(value) => unitFormatter(value)} tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} width={74} />
              <Tooltip formatter={tooltipFormatter} />
              <Legend />
              <Bar dataKey="current" name="Current 7d" fill="#1b5cff" radius={[5, 5, 0, 0]} />
              <Bar dataKey="previous" name="Previous 7d" fill="#b8c4cc" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard
        eyebrow="Capital efficiency"
        title="24h volume-to-TVL"
        note="Calculated as native 24h volume divided by current TVL. Zero or unavailable TVL produces N/A, never infinity."
      >
        {!efficiencyData.length ? (
          <EmptyChart message="Efficiency data unavailable." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={efficiencyData} layout="vertical" margin={{ top: 4, right: 12, left: 12, bottom: 0 }}>
              <CartesianGrid stroke={gridColor} horizontal={false} />
              <XAxis type="number" tickFormatter={(value) => `${Number(value).toFixed(2)}x`} tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={86} tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(value) => `${Number(value).toFixed(3)}x`} />
              <Bar dataKey="value" name="24h volume / TVL" radius={[0, 6, 6, 0]}>
                {efficiencyData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard
        className="chart-card--wide"
        eyebrow="Capital distribution"
        title="Tracked TVL by DEX"
        note="Current TVL for DEXes with an available value, using the active reconciled or benchmark view. Missing TVL is excluded rather than estimated."
      >
        {!tvlData.length ? (
          <EmptyChart message="Tracked TVL data unavailable." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tvlData} layout="vertical" margin={{ top: 4, right: 20, left: 12, bottom: 0 }}>
              <CartesianGrid stroke={gridColor} horizontal={false} />
              <XAxis type="number" tickFormatter={(value) => unitFormatter(value)} tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={94} tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={tooltipFormatter} />
              <Bar dataKey="value" name="Tracked TVL" radius={[0, 6, 6, 0]}>
                {tvlData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}
