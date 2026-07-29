"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Database, X, XCircle } from "lucide-react";
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
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const errors = sources.filter((source) => source.health === "error").length;
  const stale = sources.filter((source) => source.health === "stale").length;
  const active = sources.length - errors;
  const overall = errors ? "degraded" : stale ? "stale" : "healthy";

  const closePanel = (restoreFocus = false) => {
    const details = detailsRef.current;
    if (!details) return;

    details.open = false;
    if (restoreFocus) details.querySelector("summary")?.focus();
  };

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const details = detailsRef.current;
      if (!details?.open || !(event.target instanceof Node)) return;
      if (!details.contains(event.target)) details.open = false;
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      const details = detailsRef.current;
      if (event.key !== "Escape" || !details?.open) return;
      event.preventDefault();
      details.open = false;
      details.querySelector("summary")?.focus();
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <details ref={detailsRef} className="source-status">
      <summary>
        <span className={`source-status__dot source-status__dot--${overall}`} />
        <Database className="source-status__database" size={15} aria-hidden="true" />
        <span>{overall === "healthy" ? "Sources healthy" : overall === "stale" ? "Stale source detected" : "Sources degraded"}</span>
        <span className="source-status__count">{active}/{sources.length} active</span>
        <ChevronDown className="dropdown-chevron" size={15} aria-hidden="true" />
      </summary>
      <div className="source-status__backdrop" aria-hidden="true" onClick={() => closePanel()} />
      <div className="source-status__panel">
        <div className="source-status__panel-header">
          <strong>Source details</strong>
          <button type="button" className="source-status__close" onClick={() => closePanel(true)} aria-label="Close source details">
            <X size={15} aria-hidden="true" />
            <span>Close</span>
          </button>
        </div>
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
