export type HoldingEmpresa = "CMYM" | "SYSO" | "SANUM";

type CompanyTheme = {
  accent: string;
  solidRgb: string;
  badgeBackground: string;
  badgeText: string;
};

export const COMPANY_THEME: Record<HoldingEmpresa, CompanyTheme> = {
  CMYM: {
    accent: "#cc0000",
    solidRgb: "204,0,0",
    badgeBackground: "rgba(204,0,0,0.08)",
    badgeText: "#cc0000"
  },
  SYSO: {
    accent: "#dca518",
    solidRgb: "220,165,24",
    badgeBackground: "rgba(220,165,24,0.15)",
    badgeText: "#b8860b"
  },
  SANUM: {
    accent: "#c026d3",
    solidRgb: "192,38,211",
    badgeBackground: "rgba(192,38,211,0.1)",
    badgeText: "#c026d3"
  }
};

export function isHoldingEmpresa(value: string): value is HoldingEmpresa {
  return value === "CMYM" || value === "SYSO" || value === "SANUM";
}

export function getCompanyTheme(value: string) {
  return isHoldingEmpresa(value) ? COMPANY_THEME[value] : null;
}

export function getFacturaSuffix(value: string) {
  const factura = String(value ?? "").trim();
  if (!factura) return "-";

  const match = factura.match(/(\d+)(?!.*\d)/);
  return match?.[1] ?? factura;
}
