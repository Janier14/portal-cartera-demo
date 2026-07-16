export type ArlDetail = {
  EMPRESA: string;
  ARL: string;
  "AÑO"?: number;
  "AÃ‘O"?: number;
  "AÃƒâ€˜O"?: number;
  MES: string;
  NIT: string;
  COMISION: number;
  COMISION_NETA: number;
  VALOR_RETENCION: number;
  VALOR_RETORNO: number;
  COTIZACION: number;
};

export type ArlByYear = {
  ARL: string;
  COMISION: number;
  COMISION_NETA: number;
  "AÑO"?: number;
  "AÃ‘O"?: number;
  "AÃƒâ€˜O"?: number;
};

export type ArlData = {
  _meta?: {
    last_import?: string;
  };
  por_anio: Record<string, number>;
  por_anio_neta: Record<string, number>;
  por_arl: Record<string, number>;
  por_arl_neta: Record<string, number>;
  por_ciudad: Record<string, number>;
  por_ciudad_neta: Record<string, number>;
  por_mes: Record<string, number>;
  por_mes_neta: Record<string, number>;
  top_empresas: Record<string, number>;
  top_empresas_neta: Record<string, number>;
  arl_anio: ArlByYear[];
  detalle: ArlDetail[];
  anios_disponibles?: number[];
  total_registros?: number;
  total_empresas?: number;
  total_comision?: number;
  total_comision_neta?: number;
  total_cotizacion?: number;
};

export type ArlMode = "BRUTO" | "NETO";
type ArlNumericMapKey = "por_anio" | "por_anio_neta" | "por_arl" | "por_arl_neta" | "top_empresas" | "top_empresas_neta";
type ArlValueField = "COMISION" | "COMISION_NETA";

export const MONTH_ORDER = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const MONTH_LABELS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
export const ARL_COLORS: Record<string, string> = {
  "ARL SURA": "#0077c8",
  COLPATRIA: "#cc0000",
  POSITIVA: "#fa8072",
  COLMENA: "#2e8b7a",
  BOLIVAR: "#4caf50",
  "ARL COLSANITAS": "#0891b2",
  // Datos demo de data/*.json (solo cuando PORTFOLIO_DEMO_MODE esta apagado)
  "ARL ANDINA": "#0077c8",
  "ARL MERIDIANO": "#cc0000",
  "ARL PACIFICO": "#fa8072",
  "ARL CUMBRE": "#2e8b7a",
  "ARL HORIZONTE": "#4caf50",
  "ARL AUSTRAL": "#0891b2"
};

export function arlYears(data: ArlData) {
  return (data.anios_disponibles ?? Object.keys(data.por_anio).map(Number)).slice().sort((a, b) => a - b);
}

export function resolveArlYear(row: ArlDetail | ArlByYear) {
  return Number(
    row["AÑO"] ??
      row["AÃ‘O"] ??
      row["AÃƒâ€˜O"] ??
      (row as ArlDetail & { "AÃƒÆ’Ã¢â‚¬ËœO"?: number })["AÃƒÆ’Ã¢â‚¬ËœO"] ??
      0
  );
}

export function getArlValueKeys(mode: ArlMode) {
  return mode === "NETO"
    ? ({ byYear: "por_anio_neta", byArl: "por_arl_neta", field: "COMISION_NETA", top: "top_empresas_neta" } as { byYear: ArlNumericMapKey; byArl: ArlNumericMapKey; field: ArlValueField; top: ArlNumericMapKey })
    : ({ byYear: "por_anio", byArl: "por_arl", field: "COMISION", top: "top_empresas" } as { byYear: ArlNumericMapKey; byArl: ArlNumericMapKey; field: ArlValueField; top: ArlNumericMapKey });
}

export function getArlSummary(data: ArlData, mode: ArlMode, year: number | "all") {
  const keys = getArlValueKeys(mode);
  const rows = year === "all" ? data.detalle : data.detalle.filter((row) => resolveArlYear(row) === year);
  const byYearMap = data[keys.byYear] as Record<string, number>;
  const totalComision =
    year === "all" ? Object.values(byYearMap).reduce((sum, value) => sum + value, 0) : Number(byYearMap[String(year)] || 0);

  return {
    totalComision,
    totalCotizacion: rows.reduce((sum, row) => sum + Number(row.COTIZACION || 0), 0),
    totalEmpresas: new Set(rows.map((row) => row.EMPRESA)).size,
    totalRegistros: rows.length
  };
}

export function getArlTopCompanies(data: ArlData, mode: ArlMode, year: number | "all") {
  const field = getArlValueKeys(mode).field;
  if (year === "all") {
    const key = getArlValueKeys(mode).top;
    const topMap = data[key] as Record<string, number>;
    return Object.entries(topMap)
      .map(([empresa, valor]) => ({ empresa, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);
  }

  const grouped = new Map<string, number>();
  data.detalle
    .filter((row) => resolveArlYear(row) === year)
    .forEach((row) => {
      grouped.set(row.EMPRESA, (grouped.get(row.EMPRESA) ?? 0) + Number(row[field] || 0));
    });

  return Array.from(grouped.entries())
    .map(([empresa, valor]) => ({ empresa, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);
}

export function aggregateArlMonthly(data: ArlData, mode: ArlMode, year: number | "all") {
  const field = getArlValueKeys(mode).field;
  const rows = year === "all" ? data.detalle : data.detalle.filter((row) => resolveArlYear(row) === year);
  return MONTH_ORDER.map((monthKey, index) => {
    const monthRows = rows.filter((row) => row.MES.toLowerCase().startsWith(monthKey));
    return {
      label: MONTH_LABELS[index],
      comision: monthRows.reduce((sum, row) => sum + Number(row[field] || 0), 0),
      cotizacion: monthRows.reduce((sum, row) => sum + Number(row.COTIZACION || 0), 0)
    };
  });
}

export function aggregateArlByArlForYear(data: ArlData, mode: ArlMode, year: number | "all") {
  const key = getArlValueKeys(mode).byArl;
  if (year === "all") {
    const byArlMap = data[key] as Record<string, number>;
    return Object.entries(byArlMap).map(([label, value]) => ({ label, value: Number(value || 0) }));
  }
  const field = getArlValueKeys(mode).field;
  return data.arl_anio
    .filter((row) => resolveArlYear(row) === year)
    .map((row) => ({ label: row.ARL, value: Number(row[field] || 0) }));
}

export function aggregateArlCompanies(data: ArlData, mode: ArlMode, year: number | "all") {
  const field = getArlValueKeys(mode).field;
  const rows = year === "all" ? data.detalle : data.detalle.filter((row) => resolveArlYear(row) === year);
  const grouped = new Map<string, { empresa: string; arl: string; nit: string; comision: number; cotizacion: number; retencion: number; retorno: number }>();

  rows.forEach((row) => {
    const key = `${row.EMPRESA}::${row.ARL}`;
    const current = grouped.get(key) ?? {
      empresa: row.EMPRESA,
      arl: row.ARL,
      nit: row.NIT,
      comision: 0,
      cotizacion: 0,
      retencion: 0,
      retorno: 0
    };
    current.comision += Number(row[field] || 0);
    current.cotizacion += Number(row.COTIZACION || 0);
    current.retencion += Number(row.VALOR_RETENCION || 0);
    current.retorno += Number(row.VALOR_RETORNO || 0);
    grouped.set(key, current);
  });

  return Array.from(grouped.values()).sort((a, b) => b.comision - a.comision);
}

export function aggregateArlInsurersByYear(data: ArlData, mode: ArlMode) {
  const field = getArlValueKeys(mode).field;
  const years = arlYears(data);
  const arls = Array.from(new Set(data.arl_anio.map((row) => row.ARL)));
  return {
    years,
    arls,
    series: arls.map((arl) =>
      years.map((year) => Number(data.arl_anio.find((row) => row.ARL === arl && resolveArlYear(row) === year)?.[field] || 0))
    )
  };
}

export function aggregateArlCities(data: ArlData, mode: ArlMode, year: number | "all") {
  const rows = year === "all" ? data.detalle : data.detalle.filter((row) => resolveArlYear(row) === year);
  const field = getArlValueKeys(mode).field;
  const cityMap = new Map<string, number>();

  rows.forEach((row) => {
    const city = String((row as ArlDetail & { CIUDAD?: string }).CIUDAD ?? "").trim().toUpperCase();
    if (!city) return;
    cityMap.set(city, (cityMap.get(city) ?? 0) + Number(row[field] || 0));
  });

  if (cityMap.size > 0) {
    return Array.from(cityMap.entries())
      .map(([city, value]) => ({ city, value }))
      .sort((a, b) => b.value - a.value);
  }

  if (year === "all") {
    return Object.entries(mode === "NETO" ? data.por_ciudad_neta : data.por_ciudad)
      .map(([city, value]) => ({ city, value: Number(value || 0) }))
      .sort((a, b) => b.value - a.value);
  }

  return [];
}

export function aggregateArlCompaniesByMonth(data: ArlData, mode: ArlMode, year: number | "all") {
  const field = getArlValueKeys(mode).field;
  const rows = year === "all" ? data.detalle : data.detalle.filter((row) => resolveArlYear(row) === year);
  const grouped = new Map<string, {
    empresa: string; arl: string; nit: string;
    comisionMonths: number[]; cotizacionMonths: number[];
    retencion: number; retorno: number;
  }>();

  rows.forEach((row) => {
    const key = `${row.EMPRESA}::${row.ARL}`;
    const current = grouped.get(key) ?? {
      empresa: row.EMPRESA, arl: row.ARL, nit: row.NIT,
      comisionMonths: MONTH_ORDER.map(() => 0),
      cotizacionMonths: MONTH_ORDER.map(() => 0),
      retencion: 0, retorno: 0
    };
    const monthIndex = MONTH_ORDER.findIndex((m) => row.MES.toLowerCase().startsWith(m));
    if (monthIndex !== -1) {
      current.comisionMonths[monthIndex] += Number(row[field] || 0);
      current.cotizacionMonths[monthIndex] += Number(row.COTIZACION || 0);
    }
    current.retencion += Number(row.VALOR_RETENCION || 0);
    current.retorno += Number(row.VALOR_RETORNO || 0);
    grouped.set(key, current);
  });

  return Array.from(grouped.values()).map((item) => ({
    ...item,
    comision: item.comisionMonths.reduce((sum, v) => sum + v, 0),
    cotizacion: item.cotizacionMonths.reduce((sum, v) => sum + v, 0)
  })).sort((a, b) => b.comision - a.comision);
}

export function aggregateArlSummaryByInsurerAndMonth(data: ArlData, mode: ArlMode, year: number | "all") {
  const field = getArlValueKeys(mode).field;
  const rows = year === "all" ? data.detalle : data.detalle.filter((row) => resolveArlYear(row) === year);
  const arls = Array.from(new Set(rows.map((row) => row.ARL)));
  const months = MONTH_ORDER.filter((monthKey) => rows.some((row) => row.MES.toLowerCase().startsWith(monthKey)));

  const values = arls.map((arl) => {
    const monthValues = months.map((monthKey) =>
      rows
        .filter((row) => row.ARL === arl && row.MES.toLowerCase().startsWith(monthKey))
        .reduce((sum, row) => sum + Number(row[field] || 0), 0)
    );
    return {
      arl,
      months: monthValues,
      total: monthValues.reduce((sum, value) => sum + value, 0)
    };
  });

  const totals = months.map((_, index) => values.reduce((sum, row) => sum + row.months[index], 0));

  return {
    months,
    rows: values.sort((a, b) => b.total - a.total),
    totals,
    grandTotal: totals.reduce((sum, value) => sum + value, 0)
  };
}

function normalizeArlYearValue(row: Record<string, unknown>) {
  return Number(
    row["AÑO"] ??
      row["AÃ‘O"] ??
      row["AÃƒâ€˜O"] ??
      row["AÃƒÆ’Ã¢â‚¬ËœO"] ??
      row["AÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‹Å“O"] ??
      0
  );
}

export function normalizeArlData(data: ArlData): ArlData {
  const detalle = (data.detalle ?? []).map((row) => {
    const year = normalizeArlYearValue(row as Record<string, unknown>);
    return year
      ? ({
          ...row,
          "AÑO": year,
          "AÃ‘O": year
        } as ArlDetail)
      : row;
  });

  const arl_anio = (data.arl_anio ?? []).map((row) => {
    const year = normalizeArlYearValue(row as Record<string, unknown>);
    return year
      ? ({
          ...row,
          "AÑO": year,
          "AÃ‘O": year
        } as ArlByYear)
      : row;
  });

  const anios_disponibles = (
    data.anios_disponibles?.length
      ? data.anios_disponibles
      : Array.from(
          new Set(
            [...detalle, ...arl_anio]
              .map((row) => normalizeArlYearValue(row as unknown as Record<string, unknown>))
              .filter((yearValue) => Number.isFinite(yearValue) && yearValue > 0)
          )
        )
  )
    .slice()
    .sort((a, b) => a - b);

  return {
    ...data,
    detalle,
    arl_anio,
    anios_disponibles,
    total_registros: data.total_registros ?? detalle.length,
    total_empresas: data.total_empresas ?? new Set(detalle.map((row) => row.EMPRESA)).size
  };
}
