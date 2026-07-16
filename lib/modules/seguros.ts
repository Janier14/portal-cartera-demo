export type SegurosRow = {
  ASEGURADO: string;
  ASEGURADORA: string;
  PRIMA: number;
  COMISION: number;
  PORCENTAJE_COMISION: number | null;
  MES: string;
  MES_KEY: string;
  ANIO: number;
  FECHA_PAGADA: string;
  ESTADO: string;
  POLIZA: string;
};

const YEARS_KEY = "a\u00f1os";
const LEGACY_YEARS_KEY = "a\u00c3\u00b1os";
const MONTH_KEYS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;
const MONTH_LABELS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"] as const;

export type SegurosData = {
  _meta?: {
    last_import?: string;
  };
  resumen: {
    total_comisiones: number;
    total_prima: number;
    clientes_unicos: number;
    registros_totales: number;
    [YEARS_KEY]?: number[];
    [LEGACY_YEARS_KEY]?: number[];
  };
  por_anio: Record<string, number>;
  por_aseguradora: Record<string, number>;
  tendencia_mensual: { mes: string; comision: number; prima: number }[];
  top_clientes: { asegurado: string; comision: number; prima: number }[];
  detalle: SegurosRow[];
};

function normalizeMonthKey(value: string) {
  return String(value || "").trim().toLowerCase().slice(0, 3);
}

export function segurosYears(data: SegurosData) {
  const source = data.resumen[YEARS_KEY] ?? data.resumen[LEGACY_YEARS_KEY] ?? [];
  return source.slice().sort((a, b) => a - b);
}

export function filterSegurosRows(data: SegurosData, year: number | "all") {
  return year === "all" ? data.detalle : data.detalle.filter((row) => row.ANIO === year);
}

export function getSegurosSummary(data: SegurosData, year: number | "all") {
  const rows = filterSegurosRows(data, year);
  return {
    totalComisiones: rows.reduce((sum, row) => sum + Number(row.COMISION || 0), 0),
    totalPrima: rows.reduce((sum, row) => sum + Number(row.PRIMA || 0), 0),
    clientesUnicos: new Set(rows.map((row) => row.ASEGURADO)).size,
    registros: rows.length
  };
}

export function aggregateSegurosByAseguradora(data: SegurosData, year: number | "all") {
  const rows = filterSegurosRows(data, year);
  const grouped = new Map<string, number>();
  rows.forEach((row) => grouped.set(row.ASEGURADORA, (grouped.get(row.ASEGURADORA) ?? 0) + Number(row.COMISION || 0)));
  return Array.from(grouped.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export function aggregateSegurosMonthly(data: SegurosData, year: number | "all") {
  const rows = filterSegurosRows(data, year);
  return MONTH_KEYS.map((key, index) => {
    const monthRows = rows.filter((row) => normalizeMonthKey(row.MES_KEY || row.MES) === key);
    return {
      mes: MONTH_LABELS[index],
      comision: monthRows.reduce((sum, row) => sum + Number(row.COMISION || 0), 0),
      prima: monthRows.reduce((sum, row) => sum + Number(row.PRIMA || 0), 0)
    };
  });
}

export function aggregateSegurosClients(data: SegurosData, year: number | "all") {
  const rows = filterSegurosRows(data, year);
  const grouped = new Map<string, { asegurado: string; aseguradora: string; estado: string; prima: number; comision: number; polizas: number }>();
  rows.forEach((row) => {
    const current = grouped.get(row.ASEGURADO) ?? { asegurado: row.ASEGURADO, aseguradora: row.ASEGURADORA, estado: row.ESTADO, prima: 0, comision: 0, polizas: 0 };
    current.prima += Number(row.PRIMA || 0);
    current.comision += Number(row.COMISION || 0);
    current.polizas += 1;
    grouped.set(row.ASEGURADO, current);
  });
  return Array.from(grouped.values()).sort((a, b) => b.comision - a.comision);
}

export function aggregateSegurosInsurers(data: SegurosData, year: number | "all") {
  const rows = filterSegurosRows(data, year);
  const grouped = new Map<string, { aseguradora: string; comision: number; prima: number; registros: number }>();
  rows.forEach((row) => {
    const current = grouped.get(row.ASEGURADORA) ?? { aseguradora: row.ASEGURADORA, comision: 0, prima: 0, registros: 0 };
    current.comision += Number(row.COMISION || 0);
    current.prima += Number(row.PRIMA || 0);
    current.registros += 1;
    grouped.set(row.ASEGURADORA, current);
  });
  return Array.from(grouped.values()).sort((a, b) => b.comision - a.comision);
}
