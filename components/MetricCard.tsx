import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

export function MetricCard({
  label,
  value,
  meta,
  change,
  featured = false,
}: {
  label: string;
  value: string;
  meta: string;
  change?: number | null;
  featured?: boolean;
}) {
  const trend = change == null ? "neutral" : change > 0 ? "positive" : change < 0 ? "negative" : "neutral";
  const TrendIcon = trend === "positive" ? ArrowUpRight : trend === "negative" ? ArrowDownRight : Minus;

  return (
    <article className={`metric-card ${featured ? "metric-card--featured" : ""}`}>
      <div className="metric-card__top">
        <span>{label}</span>
        {change !== undefined ? (
          <span className={`trend trend--${trend}`}>
            <TrendIcon size={14} aria-hidden="true" />
            {change == null ? "N/A" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`}
          </span>
        ) : null}
      </div>
      <strong>{value}</strong>
      <p>{meta}</p>
    </article>
  );
}
