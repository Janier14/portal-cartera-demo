import { FILTER_LABEL_STYLE, FILTER_SELECT_STYLE } from "./shared";

type MonthFilterValue = "all" | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

type MonthFilterProps = {
  value: MonthFilterValue;
  onChange: (next: MonthFilterValue) => void;
  disabled?: boolean;
  label?: string;
};

const MONTHS = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" }
] as const;

export function MonthFilter({
  value,
  onChange,
  disabled = false,
  label = "Mes:"
}: MonthFilterProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
      <span style={{ ...FILTER_LABEL_STYLE, opacity: disabled ? 0.55 : 1 }}>{label}</span>
      <select
        value={String(value)}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange(nextValue === "all" ? "all" : (Number(nextValue) as MonthFilterValue));
        }}
        disabled={disabled}
        style={{
          ...FILTER_SELECT_STYLE,
          color: disabled ? "var(--module-muted)" : "var(--module-text)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1
        }}
      >
        <option value="all">Todos</option>
        {MONTHS.map((month) => (
          <option key={month.value} value={String(month.value)}>
            {month.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export type { MonthFilterValue };
