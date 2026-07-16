import { FILTER_BUTTON_ACTIVE_STYLE, FILTER_BUTTON_BASE_STYLE, FILTER_LABEL_STYLE } from "./shared";

type YearFilterProps = {
  years: number[];
  value: number | "all";
  onChange: (next: number | "all") => void;
  includeAll?: boolean;
  label?: string;
};

export function YearFilter({
  years,
  value,
  onChange,
  includeAll = true,
  label = "Año:"
}: YearFilterProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
      <span style={FILTER_LABEL_STYLE}>{label}</span>
      {includeAll ? (
        <button
          type="button"
          onClick={() => onChange("all")}
          style={{
            ...FILTER_BUTTON_BASE_STYLE,
            ...(value === "all" ? FILTER_BUTTON_ACTIVE_STYLE : null)
          }}
        >
          Todos
        </button>
      ) : null}
      {years.map((year) => (
        <button
          key={year}
          type="button"
          onClick={() => onChange(year)}
          style={{
            ...FILTER_BUTTON_BASE_STYLE,
            ...(value === year ? FILTER_BUTTON_ACTIVE_STYLE : null)
          }}
        >
          {year}
        </button>
      ))}
    </div>
  );
}
