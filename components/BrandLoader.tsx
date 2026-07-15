export function BrandLoader({
  label,
  detail,
  compact = false,
}: {
  label: string;
  detail?: string;
  compact?: boolean;
}) {
  return (
    <section
      className={`brand-loader${compact ? " brand-loader--inline" : " brand-loader--screen"}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="brand-loader__content">
        <div className="brand-loader__logo" aria-hidden="true">
          <span className="brand-loader__orbit" />
          <span className="brand-mark brand-loader__mark"><i /><i /><i /></span>
        </div>
        <div className="brand-loader__copy">
          <strong>{label}</strong>
          {detail ? <span>{detail}</span> : null}
          <span className="brand-loader__dots" aria-hidden="true"><i /><i /><i /></span>
        </div>
      </div>
    </section>
  );
}
