export type DatePreset = "24h" | "7d" | "30d" | "90d" | "custom";

const options: Array<{ value: DatePreset; label: string }> = [
  { value: "24h", label: "24H" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "custom", label: "Custom" },
];

export function DateRangeSelector({
  value,
  onChange,
  start,
  end,
  onStartChange,
  onEndChange,
  min,
  max,
}: {
  value: DatePreset;
  onChange: (value: DatePreset) => void;
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  min: string;
  max: string;
}) {
  return (
    <div className="date-range" aria-label="Chart date range">
      <div className="segmented-control">
        {options.map((option) => (
          <button
            type="button"
            key={option.value}
            className={value === option.value ? "is-active" : ""}
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
      {value === "custom" ? (
        <div className="custom-range">
          <label>
            From
            <input type="date" value={start} min={min} max={end || max} onChange={(event) => onStartChange(event.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={end} min={start || min} max={max} onChange={(event) => onEndChange(event.target.value)} />
          </label>
        </div>
      ) : null}
    </div>
  );
}
