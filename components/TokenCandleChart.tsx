"use client";

import { CENTRAL_EUROPE_TIME_ZONE, formatDateTime } from "@/lib/format";
import type { TokenCandle, TokenOrderbook } from "@/lib/token-types";

function priceLabel(value: number) {
  if (value >= 100) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  if (value >= 0.01) return value.toFixed(5);
  return value.toPrecision(5);
}

function dateLabel(timestamp: number) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: CENTRAL_EUROPE_TIME_ZONE,
  }).format(timestamp * 1000);
}

export function TokenCandleChart({
  candles,
  ticker,
}: {
  candles: TokenCandle[];
  ticker: string;
}) {
  if (!candles.length) {
    return (
      <div className="token-chart-empty">
        <strong>OHLCV data unavailable</strong>
        <span>Minswap did not return verified candle data for this token and range.</span>
      </div>
    );
  }

  const width = 1200;
  const height = 440;
  const left = 24;
  const right = 1090;
  const plotTop = 22;
  const plotBottom = 322;
  const volumeTop = 345;
  const volumeBottom = 408;
  const lows = candles.map((candle) => candle.low);
  const highs = candles.map((candle) => candle.high);
  const rawMin = Math.min(...lows);
  const rawMax = Math.max(...highs);
  const pricePadding = Math.max((rawMax - rawMin) * 0.08, rawMax * 0.01);
  const minPrice = Math.max(0, rawMin - pricePadding);
  const maxPrice = rawMax + pricePadding;
  const priceSpan = Math.max(maxPrice - minPrice, Number.EPSILON);
  const maxVolume = Math.max(...candles.map((candle) => candle.volume), 1);
  const xStep = (right - left) / Math.max(candles.length, 1);
  const bodyWidth = Math.max(1.5, Math.min(8, xStep * 0.7));
  const yPrice = (price: number) =>
    plotTop + ((maxPrice - price) / priceSpan) * (plotBottom - plotTop);
  const latest = candles[candles.length - 1];
  const latestY = yPrice(latest.close);
  const grid = Array.from({ length: 6 }, (_, index) => {
    const ratio = index / 5;
    return {
      y: plotTop + ratio * (plotBottom - plotTop),
      price: maxPrice - ratio * priceSpan,
    };
  });
  const tickIndexes = Array.from(
    new Set(
      Array.from({ length: 6 }, (_, index) =>
        Math.min(candles.length - 1, Math.round(index * (candles.length - 1) / 5)),
      ),
    ),
  );

  return (
    <div className="token-candle-wrap">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${ticker} to ADA OHLCV candlestick chart`}
      >
        {grid.map((line) => (
          <g key={line.y}>
            <line className="token-chart-gridline" x1={left} x2={right} y1={line.y} y2={line.y} />
            <text className="token-chart-axis" x={right + 16} y={line.y + 4}>{priceLabel(line.price)}</text>
          </g>
        ))}
        {candles.map((candle, index) => {
          const x = left + xStep * index + xStep / 2;
          const openY = yPrice(candle.open);
          const closeY = yPrice(candle.close);
          const highY = yPrice(candle.high);
          const lowY = yPrice(candle.low);
          const positive = candle.close >= candle.open;
          const volumeHeight = (candle.volume / maxVolume) * (volumeBottom - volumeTop);
          return (
            <g key={candle.time} className={positive ? "candle-positive" : "candle-negative"}>
              <title>{`${formatDateTime(new Date(candle.time * 1000).toISOString())} · O ${priceLabel(candle.open)} · H ${priceLabel(candle.high)} · L ${priceLabel(candle.low)} · C ${priceLabel(candle.close)} · Vol ${candle.volume.toLocaleString("en-US")}`}</title>
              <line className="candle-wick" x1={x} x2={x} y1={highY} y2={lowY} />
              <rect
                className="candle-body"
                x={x - bodyWidth / 2}
                y={Math.min(openY, closeY)}
                width={bodyWidth}
                height={Math.max(1.5, Math.abs(closeY - openY))}
                rx="0.8"
              />
              <rect
                className="candle-volume"
                x={x - bodyWidth / 2}
                y={volumeBottom - volumeHeight}
                width={bodyWidth}
                height={Math.max(1, volumeHeight)}
                rx="0.8"
              />
            </g>
          );
        })}
        <line className="token-price-line" x1={left} x2={right} y1={latestY} y2={latestY} />
        <rect className="token-price-label-bg" x={right + 8} y={latestY - 13} width="92" height="26" rx="4" />
        <text className="token-price-label" x={right + 54} y={latestY + 5} textAnchor="middle">{priceLabel(latest.close)}</text>
        <line className="token-volume-divider" x1={left} x2={right} y1={volumeTop - 10} y2={volumeTop - 10} />
        {tickIndexes.map((index) => {
          const candle = candles[index];
          const x = left + xStep * index + xStep / 2;
          return <text key={candle.time} className="token-chart-date" x={x} y={432} textAnchor="middle">{dateLabel(candle.time)}</text>;
        })}
      </svg>
    </div>
  );
}

export function TokenDepthChart({
  orderbook,
}: {
  orderbook: TokenOrderbook | null;
}) {
  if (!orderbook || (!orderbook.bids.length && !orderbook.asks.length)) {
    return (
      <div className="depth-empty">
        <strong>Depth data unavailable</strong>
        <span>The public response did not include explicit bid and ask levels.</span>
      </div>
    );
  }

  const width = 700;
  const height = 240;
  const padding = 28;
  const points = [...orderbook.bids, ...orderbook.asks];
  const minPrice = Math.min(...points.map((point) => point.price));
  const maxPrice = Math.max(...points.map((point) => point.price));
  const maxDepth = Math.max(...points.map((point) => point.cumulative), 1);
  const priceSpan = Math.max(maxPrice - minPrice, Number.EPSILON);
  const x = (price: number) => padding + ((price - minPrice) / priceSpan) * (width - padding * 2);
  const y = (depth: number) => height - padding - (depth / maxDepth) * (height - padding * 2);
  const line = (values: typeof points) => values.map((point, index) =>
    `${index ? "L" : "M"}${x(point.price).toFixed(1)},${y(point.cumulative).toFixed(1)}`,
  ).join(" ");

  return (
    <svg className="depth-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Bid and ask depth chart">
      <line className="depth-baseline" x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} />
      {orderbook.bids.length ? <path className="depth-bids" d={line(orderbook.bids)} /> : null}
      {orderbook.asks.length ? <path className="depth-asks" d={line(orderbook.asks)} /> : null}
      <text className="depth-axis-label" x={padding} y={height - 7}>{priceLabel(minPrice)}</text>
      <text className="depth-axis-label" x={width - padding} y={height - 7} textAnchor="end">{priceLabel(maxPrice)}</text>
    </svg>
  );
}
