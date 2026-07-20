import type { ReactNode } from "react";
import { PreserveTerms } from "@/components/PreserveTerms";

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
          <span><PreserveTerms>{eyebrow}</PreserveTerms></span>
          <h3><PreserveTerms>{title}</PreserveTerms></h3>
        </div>
      </header>
      <div className="chart-card__plot notranslate" translate="no">{children}</div>
      <p className="chart-card__note"><PreserveTerms>{note}</PreserveTerms></p>
    </article>
  );
}
