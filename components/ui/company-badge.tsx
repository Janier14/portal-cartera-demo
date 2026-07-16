import { getCompanyTheme } from "@/lib/company-theme";

type CompanyBadgeProps = {
  empresa: string;
  compact?: boolean;
};

const baseStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "999px",
  fontFamily: "var(--font-space-mono), monospace",
  fontWeight: 700,
  letterSpacing: ".04em",
  whiteSpace: "nowrap" as const
};

export function CompanyBadge({ empresa, compact = false }: CompanyBadgeProps) {
  const theme = getCompanyTheme(String(empresa).toUpperCase());
  const padding = compact ? "3px 9px" : "4px 10px";
  const fontSize = compact ? ".62rem" : ".65rem";

  if (!theme) {
    return (
      <span
        style={{
          ...baseStyle,
          padding,
          fontSize,
          background: "rgba(130,130,127,0.12)",
          color: "#82827f"
        }}
      >
        {empresa}
      </span>
    );
  }

  return (
    <span
      style={{
        ...baseStyle,
        padding,
        fontSize,
        background: theme.badgeBackground,
        color: theme.badgeText
      }}
    >
      {empresa}
    </span>
  );
}
