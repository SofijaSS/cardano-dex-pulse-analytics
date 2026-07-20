import { AlertTriangle, CheckCircle2, Database, XCircle } from "lucide-react";
import { PreserveTerms } from "@/components/PreserveTerms";
import { formatDateTime } from "@/lib/format";
import type { SourceStatus } from "@/lib/types";

export function DataSourceStatus({
  sources,
  warnings,
}: {
  sources: SourceStatus[];
  warnings: string[];
}) {
  const errors = sources.filter((source) => source.health === "error").length;
  const stale = sources.filter((source) => source.health === "stale").length;
  const overall = errors ? "degraded" : stale ? "stale" : "healthy";

  return (
    <details className="source-status">
      <summary>
        <span className={`source-status__dot source-status__dot--${overall}`} />
        <Database size={15} aria-hidden="true" />
        <span>{overall === "healthy" ? "Sources healthy" : overall === "stale" ? "Stale source detected" : "Sources degraded"}</span>
        <span className="source-status__count">{sources.length} checked</span>
      </summary>
      <div className="source-status__panel">
        <div className="source-status__grid">
          {sources.map((source) => {
            const Icon = source.health === "healthy" ? CheckCircle2 : source.health === "stale" ? AlertTriangle : XCircle;
            return (
              <article key={source.id} className="source-item">
                <Icon size={16} aria-hidden="true" />
                <div>
                  <strong><PreserveTerms>{source.label}</PreserveTerms></strong>
                  <span><PreserveTerms>{source.message}</PreserveTerms></span>
                  <small>Data: {formatDateTime(source.dataAt)}</small>
                </div>
              </article>
            );
          })}
        </div>
        {warnings.length ? (
          <div className="source-warnings">
            <strong>Quality notes</strong>
            {warnings.map((warning) => <p key={warning}><PreserveTerms>{warning}</PreserveTerms></p>)}
          </div>
        ) : null}
      </div>
    </details>
  );
}
