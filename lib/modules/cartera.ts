export type RecaudoRow = {
  compania: string;
  valor: number;
  pagado: number;
  fecha_factura: string;
  fecha_pago: string;
  estado: string;
  tipo: string;
  numero_factura: string;
  mes: string | number;
  anio: string | number;
  empresa?: string;
  detalle?: string;
  codigo_contable?: string;
  identificacion?: string;
};

export type ProyeccionRow = RecaudoRow & {
  dias_promedio: number;
  fecha_estimada: string | null;
  dias_restantes: number | null;
  semaforo: string;
};

export type PlanillaRow = {
  q1: boolean;
  fq1: string;
  q2: boolean;
  fq2: string;
  fact_q1: boolean;
  fact_q2: boolean;
  obs: string;
};

export type PlanillaMap = Record<string, PlanillaRow>;

export type ProyeccionCompany = {
  empresa: string;
  compania: string;
  tipo: string;
  proyeccion: number;
  variacion: number;
  estabilidad: "ALTA" | "MEDIA" | "BAJA";
  n_meses: number;
  outliers: number;
  historico: Record<string, number>;
  distribucion_semanas: [number, number, number, number];
};

export type ProyeccionNoRecurrente = {
  empresa: string;
  compania: string;
  tipo: string;
  total: number;
  n_meses: number;
  historico: Record<string, number>;
  distribucion_semanas: [number, number, number, number];
};

export type SemanasMes = {
  semana: 1 | 2 | 3 | 4;
  desde: number;
  hasta: number;
  label: string;
};

export type CarteraProjectionPayload = {
  proyecciones: ProyeccionCompany[];
  no_recurrentes: ProyeccionNoRecurrente[];
  total_proyectado: number;
  total_alta: number;
  total_media: number;
  total_baja: number;
  mes_proyeccion: string;
  semanas_mes: SemanasMes[];
};

function parseDateOnly(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const iso = raw.slice(0, 10);
  if (iso.includes("-")) {
    const parsed = new Date(`${iso}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const parts = raw.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    const parsed = new Date(`${year}-${month}-${day}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function toSortableDateNumber(value: Date | null) {
  if (!value) return 0;
  return value.getFullYear() * 10000 + (value.getMonth() + 1) * 100 + value.getDate();
}

function toMonthNumber(value: Date | null) {
  if (!value) return 0;
  return value.getFullYear() * 100 + (value.getMonth() + 1);
}

function formatDisplayDate(value: string) {
  const parsed = parseDateOnly(value);
  if (!parsed) return value || "-";
  return `${String(parsed.getDate()).padStart(2, "0")}/${String(parsed.getMonth() + 1).padStart(2, "0")}/${parsed.getFullYear()}`;
}

export function buildCarteraRaw(rows: RecaudoRow[], proyRows: ProyeccionRow[] = []) {
  const proyMap = new Map(proyRows.map((row) => [row.numero_factura, row]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Compute average payment days per company from historical paid invoices
  const companyPaidDays: Record<string, number[]> = {};
  rows.forEach((row) => {
    if (String(row.estado || "").toUpperCase() === "PAGADA" && row.fecha_factura && row.fecha_pago) {
      const factDate = parseDateOnly(String(row.fecha_factura));
      const pagoDate = parseDateOnly(String(row.fecha_pago));
      if (factDate && pagoDate) {
        const days = Math.floor((pagoDate.getTime() - factDate.getTime()) / 86400000);
        if (days >= 0 && days <= 365) {
          const co = String(row.compania || "").trim();
          companyPaidDays[co] ??= [];
          companyPaidDays[co].push(days);
        }
      }
    }
  });
  const companyAvgDays = new Map<string, number>(
    Object.entries(companyPaidDays).map(([co, days]) => [
      co,
      Math.round(days.reduce((a, b) => a + b, 0) / days.length)
    ])
  );

  const allFacturas = rows.map((row) => {
    const estado = String(row.estado || "-").toUpperCase();
    const fechaFactura = parseDateOnly(String(row.fecha_factura || ""));
    const fechaPago = parseDateOnly(String(row.fecha_pago || ""));
    const dias =
      fechaFactura && estado === "PENDIENTE"
        ? Math.max(0, Math.floor((today.getTime() - fechaFactura.getTime()) / 86400000))
        : 0;
    const proy = proyMap.get(row.numero_factura);
    const valor = Math.max(0, Number(row.valor || 0));
    const pagadoRaw = Math.max(0, Number(row.pagado || 0));
    const pagado = pagadoRaw > 0 ? pagadoRaw : estado === "PAGADA" ? valor : 0;
    const monthKey = fechaFactura
      ? `${fechaFactura.getFullYear()}-${String(fechaFactura.getMonth() + 1).padStart(2, "0")}`
      : row.mes && row.anio
        ? `${String(row.anio)}-${String(row.mes).padStart(2, "0")}`
        : "";

    // Estimated payment date: prefer external proyMap, fall back to historical avg
    let fecha_est = "-";
    let semaforo = "";
    if (proy?.fecha_estimada) {
      fecha_est = formatDisplayDate(String(proy.fecha_estimada));
      semaforo = proy.semaforo || "";
    } else if (estado === "PENDIENTE" && fechaFactura) {
      const avgDays = companyAvgDays.get(String(row.compania || "").trim());
      if (avgDays !== undefined) {
        const estDate = new Date(fechaFactura.getTime() + avgDays * 86400000);
        fecha_est = formatDisplayDate(estDate.toISOString().slice(0, 10));
        const diasRestantes = Math.floor((estDate.getTime() - today.getTime()) / 86400000);
        if (diasRestantes < 0) semaforo = "rojo";
        else if (diasRestantes <= 2) semaforo = "verde";
        else semaforo = "amarillo";
      }
    }

    return {
      factura: row.numero_factura || "-",
      compania: row.compania || "-",
      tipo: String(row.tipo || "-").toUpperCase(),
      periodo: row.mes && row.anio ? `${String(row.mes).padStart(2, "0")}/${row.anio}` : "-",
      fecha_fact: fechaFactura ? formatDisplayDate(String(row.fecha_factura || "")) : "-",
      fecha_pago: String(row.fecha_pago || "").trim() ? formatDisplayDate(String(row.fecha_pago || "")) : "-",
      valor,
      pagado,
      estado,
      dias,
      fecha_est,
      semaforo,
      empresa: row.empresa || "",
      monthKey,
      fechaFactSortNum: toSortableDateNumber(fechaFactura),
      fechaPagoSortNum: toSortableDateNumber(fechaPago),
      fechaFactMonthNum: toMonthNumber(fechaFactura),
      companiaSearch: String(row.compania || "-").toLowerCase(),
      facturaSearch: String(row.numero_factura || "-").toLowerCase()
    };
  });

  const estadoPriority: Record<string, number> = { PAGADA: 3, PENDIENTE: 2, ANULADA: 1 };
  const deduped = new Map<string, (typeof allFacturas)[number]>();

  allFacturas.forEach((row) => {
    const key = row.factura;
    const current = deduped.get(key);
    if (!current || (estadoPriority[row.estado] || 0) > (estadoPriority[current.estado] || 0)) {
      deduped.set(key, row);
    }
  });

  const facturas = [...deduped.values()];
  const porMes: Record<string, { facturado: number; pagado: number }> = {};
  let nPendientes = 0;
  let totalFacturado = 0;
  let totalPagado = 0;
  let totalPendiente = 0;
  let totalAnulado = 0;

  facturas.forEach((row) => {
    if (row.estado === "PENDIENTE") {
      nPendientes += 1;
      totalPendiente += row.valor;
    } else if (row.estado === "PAGADA") {
      totalPagado += row.valor;
    } else if (row.estado === "ANULADA") {
      totalAnulado += row.valor;
    }

    if (row.estado === "ANULADA" || !row.monthKey) return;

    totalFacturado += row.valor;
    porMes[row.monthKey] ??= { facturado: 0, pagado: 0 };
    porMes[row.monthKey].facturado += row.valor;
    if (row.estado === "PAGADA") {
      porMes[row.monthKey].pagado += row.valor;
    }
  });

  return {
    facturas,
    n_facturas: facturas.length,
    n_pendientes: nPendientes,
    total_facturado: totalFacturado,
    total_pagado: totalPagado,
    total_pendiente: totalPendiente,
    total_anulado: totalAnulado,
    por_mes: porMes
  };
}
