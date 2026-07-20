import type { ReactNode } from "react";

export function ChartCard({
  title,
  eyebrow,
  note,
  className = "",
  children,
}: {
  title: string;
  eyebrow: string;
  note: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <article className={`chart-card ${className}`}>
      <header>
        <div>
          <span>{eyebrow}</span>
          <h3>{title}</h3>
        </div>
      </header>
      <div className="chart-card__plot notranslate" translate="no">{children}</div>
      <p className="chart-card__note">{note}</p>
    </article>
  );
}
