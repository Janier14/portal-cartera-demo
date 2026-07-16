import { FILTER_BUTTON_ACTIVE_STYLE, FILTER_BUTTON_BASE_STYLE, FILTER_LABEL_STYLE } from "./shared";

type CompanyFilterProps = {
  companies: string[];
  value: string;
  onChange: (next: string) => void;
  includeAll?: boolean;
  allLabel?: string;
  label?: string;
};

export function CompanyFilter({
  companies,
  value,
  onChange,
  includeAll = true,
  allLabel = "TODAS",
  label = "Empresa:"
}: CompanyFilterProps) {
  const options = includeAll ? [allLabel, ...companies] : companies;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
      <span style={FILTER_LABEL_STYLE}>{label}</span>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          style={{
            ...FILTER_BUTTON_BASE_STYLE,
            ...(value === option ? FILTER_BUTTON_ACTIVE_STYLE : null)
          }}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
