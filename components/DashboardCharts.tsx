"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/ChartCard";
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
    wingriders:
      convertUsd(point.byDex.wingriders || 0, currency, adaPriceUsd) || 0,
  }));
  const unitFormatter = (value: unknown) =>
    formatMoney(Number(value), currency, currency === "USD" ? null : 1, true);
  const tooltipFormatter = (value: unknown) => unitFormatter(value);
  const pieData = dexes
    .filter((dex) => (dex.volume24hUsd || 0) > 0)
    .slice(0, 8)
    .map((dex) => ({
      name: dex.name,
      value: convertUsd(dex.volume24hUsd, currency, adaPriceUsd) || 0,
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
  const comparisonData = dexes
    .filter(
      (dex) =>
        dex.nativeVolume24hUsd != null || dex.defillamaVolume24hUsd != null,
    )
    .slice(0, 9)
    .map((dex) => ({
      name: dex.name,
      native: convertUsd(dex.nativeVolume24hUsd, currency, adaPriceUsd) || 0,
      benchmark:
        convertUsd(dex.defillamaVolume24hUsd, currency, adaPriceUsd) || 0,
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
        title="Current market share"
        note="Share of observed 24h volume across DEXes with usable native metrics. This is not presented as complete Cardano market coverage."
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
        eyebrow="WingRiders focus"
        title="WingRiders vs Cardano benchmark"
        note="Both lines use the same DefiLlama daily benchmark series; WingRiders current native value is separately reconciled in the focus section."
      >
        {!convertedSeries.length ? (
          <EmptyChart message="WingRiders benchmark history unavailable." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={convertedSeries} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={gridColor} vertical={false} />
              <XAxis dataKey="timestamp" tickFormatter={dateLabel} tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={28} />
              <YAxis tickFormatter={(value) => unitFormatter(value)} tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} width={78} />
              <Tooltip formatter={tooltipFormatter} labelFormatter={(value) => dateLabel(Number(value))} />
              <Legend />
              <Line type="monotone" dataKey="total" name="Cardano benchmark" stroke="#97a6b0" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="wingriders" name="WingRiders" stroke="#1b5cff" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard
        className="chart-card--wide"
        eyebrow="Source reconciliation"
        title="Native API vs DefiLlama, current period"
        note="Material variance is shown, not averaged away. Different rolling and UTC-day semantics can contribute to the gap."
      >
        {!comparisonData.length ? (
          <EmptyChart message="Source comparison data unavailable." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={comparisonData} margin={{ top: 10, right: 8, left: 0, bottom: 46 }}>
              <CartesianGrid stroke={gridColor} vertical={false} />
              <XAxis dataKey="name" angle={-25} textAnchor="end" interval={0} tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(value) => unitFormatter(value)} tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} width={78} />
              <Tooltip formatter={tooltipFormatter} />
              <Legend />
              <Bar dataKey="native" name="Native / reconciled" fill="#1b5cff" radius={[5, 5, 0, 0]} />
              <Bar dataKey="benchmark" name="DefiLlama" fill="#ef6c47" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}
