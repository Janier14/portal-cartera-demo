import { NextRequest, NextResponse } from "next/server";

import { forbiddenResponse, requireSession, unauthorizedResponse } from "@/lib/auth";
import { getDemoAlertasPayload } from "@/lib/demo-analytics";
import { isPortfolioDemoMode } from "@/lib/env";
import {
  buildMonthWindow,
  computePlanillaAlerts,
  HISTORY_MONTHS,
  type CompaniaInput,
  type PlanillaHistRow
} from "@/lib/planillas-alertas";
import { createServerSupabase } from "@/lib/supabase/server";

type PeriodKey = "current-month" | "rolling-3m" | "year-to-date";
type EmpresaCode = "CMYM" | "SYSO" | "SANUM";
type AlertSeverity = "critica" | "advertencia" | "informativa" | "positiva";
type AlertIcon =
  | "AlertOctagon"
  | "TrendingUp"
  | "AlertCircle"
  | "TrendingDown"
  | "Users"
  | "Star"
  | "AlertTriangle"
  | "UserX"
  | "UserPlus"
  | "Clock";

type Range = {
  start: Date;
  end: Date;
};

type RecaudoBaseRow = {
  empresa: string | null;
  estado: string | null;
  fecha_elaboracion: string | null;
  fecha_pago: string | null;
  debito: number | null;
  valor_pagado: number | null;
  nombre_tercero: string | null;
};

type RecaudoRow = {
  empresa: EmpresaCode | null;
  estado: string;
  fechaElaboracion: Date | null;
  fechaPago: Date | null;
  debito: number;
  valorPagado: number;
  nombreTercero: string;
};

type AlertResponseItem = {
  id: string;
  tipo: string;
  severidad: AlertSeverity;
  icono: AlertIcon;
  titulo: string;
  descripcion: string;
  monto: number | null;
  magnitud: number;
};

const VALID_PERIODS: string[] = ["current-month", "rolling-3m", "year-to-date"];
const HOLDING_EMPRESAS: EmpresaCode[] = ["CMYM", "SYSO", "SANUM"];
const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critica: 4,
  advertencia: 3,
  informativa: 2,
  positiva: 1
};

function isPeriodKey(value: string): boolean {
  if (VALID_PERIODS.includes(value)) return true;
  if (/^\d{4}-\d{2}$/.test(value)) return true;
  if (/^range:\d{4}-\d{2}:\d{4}-\d{2}$/.test(value)) return true;
  return false;
}

function createUtcDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function createUtcDateClamped(year: number, monthIndex: number, day: number) {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIndex, Math.min(day, lastDay)));
}

function addUtcMonths(date: Date, months: number) {
  return createUtcDateClamped(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate());
}

function startOfUtcMonth(date: Date) {
  return createUtcDate(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function endOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function addUtcDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86400000);
}

function getBogotaToday() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const parts = formatter.formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "1970");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "01");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "01");

  return createUtcDate(year, month - 1, day);
}

function formatDateOnly(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function formatMonthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseDateOnly(value: string | null | undefined): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const iso = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [year, month, day] = iso.split("-").map(Number);
    return createUtcDate(year, month - 1, day);
  }

  const slashParts = raw.split("/");
  if (slashParts.length === 3) {
    const [day, month, year] = slashParts.map(Number);
    if (year && month && day) {
      return createUtcDate(year, month - 1, day);
    }
  }

  const dashParts = raw.split("-");
  if (dashParts.length === 3 && dashParts[0]?.length === 2) {
    const [day, month, year] = dashParts.map(Number);
    if (year && month && day) {
      return createUtcDate(year, month - 1, day);
    }
  }

  return null;
}

function inRange(date: Date | null, range: Range) {
  if (!date) return false;
  return date.getTime() >= range.start.getTime() && date.getTime() <= range.end.getTime();
}

function buildPeriodRanges(period: string, today: Date): { current: Range; previous: Range } {
  if (period === "current-month") {
    const currentStart = startOfUtcMonth(today);
    const previousMonthStart = startOfUtcMonth(addUtcMonths(today, -1));
    const elapsedDays = Math.floor((today.getTime() - currentStart.getTime()) / 86400000);
    const previousMonthEnd = addUtcDays(previousMonthStart, elapsedDays);
    return {
      current: { start: currentStart, end: today },
      previous: { start: previousMonthStart, end: previousMonthEnd }
    };
  }

  if (/^range:\d{4}-\d{2}:\d{4}-\d{2}$/.test(period)) {
    const [, startStr, endStr] = period.match(/^range:(\d{4}-\d{2}):(\d{4}-\d{2})$/) || [];
    const [startYear, startMonth] = startStr.split("-").map(Number);
    const [endYear, endMonth] = endStr.split("-").map(Number);
    
    const currentStart = createUtcDate(startYear, startMonth - 1, 1);
    const currentEnd = endOfUtcMonth(createUtcDate(endYear, endMonth - 1, 1));
    
    // Calculate difference in months
    const durationMonths = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
    
    const previousStart = startOfUtcMonth(addUtcMonths(currentStart, -durationMonths));
    const previousEnd = endOfUtcMonth(addUtcMonths(currentEnd, -durationMonths));
    
    return {
      current: { start: currentStart, end: currentEnd },
      previous: { start: previousStart, end: previousEnd }
    };
  }

  if (/^\d{4}-\d{2}$/.test(period)) {
    const [year, month] = period.split("-").map(Number);
    const currentStart = createUtcDate(year, month - 1, 1);
    const currentEnd = endOfUtcMonth(currentStart);
    const previousStart = startOfUtcMonth(addUtcMonths(currentStart, -1));
    const previousEnd = endOfUtcMonth(previousStart);
    return {
      current: { start: currentStart, end: currentEnd },
      previous: { start: previousStart, end: previousEnd }
    };
  }

  if (period === "rolling-3m") {
    const currentStart = startOfUtcMonth(addUtcMonths(today, -2));
    const durationDays = Math.floor((today.getTime() - currentStart.getTime()) / 86400000);
    const previousStart = addUtcDays(currentStart, -(durationDays + 1));
    const previousEnd = addUtcDays(previousStart, durationDays);
    return {
      current: { start: currentStart, end: today },
      previous: { start: previousStart, end: previousEnd }
    };
  }

  return {
    current: {
      start: createUtcDate(today.getUTCFullYear(), 0, 1),
      end: today
    },
    previous: {
      start: createUtcDate(today.getUTCFullYear() - 1, 0, 1),
      end: createUtcDateClamped(today.getUTCFullYear() - 1, today.getUTCMonth(), today.getUTCDate())
    }
  };
}

function normalizeEmpresa(value: string | null | undefined): EmpresaCode | null {
  const empresa = String(value ?? "").trim().toUpperCase();
  return HOLDING_EMPRESAS.includes(empresa as EmpresaCode) ? (empresa as EmpresaCode) : null;
}

function normalizeClientName(value: string | null | undefined) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

function formatCurrency(value: number) {
  return `$${Math.round(value).toLocaleString("es-CO")}`;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function computeChange(currentValue: number, previousValue: number) {
  if (previousValue === 0) {
    return currentValue > 0 ? 100 : 0;
  }

  return Number((((currentValue - previousValue) / previousValue) * 100).toFixed(1));
}

function computeHistoricalAverage(values: number[]) {
  const positiveValues = values.filter((value) => value > 0);
  if (positiveValues.length === 0) return 0;
  return positiveValues.reduce((sum, value) => sum + value, 0) / positiveValues.length;
}

function buildRecentCompleteMonths(referenceDate: Date, count: number, offsetFromCurrentMonth = 1) {
  const currentMonthStart = startOfUtcMonth(referenceDate);
  return Array.from({ length: count }, (_, index) => {
    const monthStart = startOfUtcMonth(addUtcMonths(currentMonthStart, -(offsetFromCurrentMonth + count - 1 - index)));
    return {
      key: formatMonthKey(monthStart),
      start: monthStart,
      end: endOfUtcMonth(monthStart)
    };
  });
}

function daysBetween(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
}

function getOutstandingAsOf(row: RecaudoRow, cutoff: Date, thresholdDays: number) {
  if (!row.fechaElaboracion) return 0;

  const agingThreshold = addUtcDays(cutoff, -thresholdDays);
  if (row.fechaElaboracion.getTime() >= agingThreshold.getTime()) return 0;

  if (row.debito <= 0) return 0;

  const pagoAplicable =
    row.fechaPago && row.fechaPago.getTime() <= cutoff.getTime()
      ? Math.min(row.valorPagado, row.debito)
      : 0;

  const saldo = row.debito - pagoAplicable;
  return saldo > 0 ? saldo : 0;
}

function sumValues(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}

async function fetchAlertRows() {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("recaudos")
    .select("empresa,estado,fecha_elaboracion,fecha_pago,debito,valor_pagado,nombre_tercero")
    .in("empresa", HOLDING_EMPRESAS)
    .neq("estado", "ANULADA");

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as RecaudoBaseRow[])
    .map<RecaudoRow>((row) => ({
      empresa: normalizeEmpresa(row.empresa),
      estado: String(row.estado ?? "").trim().toUpperCase(),
      fechaElaboracion: parseDateOnly(row.fecha_elaboracion),
      fechaPago: parseDateOnly(row.fecha_pago),
      debito: Math.max(0, Number(row.debito ?? 0)),
      valorPagado: Math.max(0, Number(row.valor_pagado ?? 0)),
      nombreTercero: normalizeClientName(row.nombre_tercero)
    }))
    .filter((row) => row.empresa && row.estado !== "ANULADA");
}

function buildAlerts(rows: RecaudoRow[], period: string, today: Date) {
  const { current } = buildPeriodRanges(period, today);
  const currentCutoff = current.end;
  const thirtyDaysAgo = addUtcDays(currentCutoff, -30);
  const sixtyDaysAgo = addUtcDays(currentCutoff, -60);
  const last7DaysAgo = addUtcDays(currentCutoff, -7);
  const lastCompleteMonthStart = startOfUtcMonth(addUtcMonths(currentCutoff, -1));
  const lastCompleteMonthEnd = endOfUtcMonth(lastCompleteMonthStart);
  const previousSixCompleteMonths = buildRecentCompleteMonths(currentCutoff, 6, 2);
  const recentSixMonthsWindowStart = startOfUtcMonth(addUtcMonths(currentCutoff, -5));

  const alerts: AlertResponseItem[] = [];

  const carteraCriticaByClient = new Map<string, number>();
  let carteraCriticaTotal = 0;

  for (const row of rows) {
    const saldo90 = getOutstandingAsOf(row, currentCutoff, 90);
    if (saldo90 <= 0) continue;

    carteraCriticaTotal += saldo90;
    carteraCriticaByClient.set(row.nombreTercero, (carteraCriticaByClient.get(row.nombreTercero) ?? 0) + saldo90);
  }

  const topMora90 = [...carteraCriticaByClient.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topMora90 && topMora90[1] > 5_000_000) {
    alerts.push({
      id: "cartera_top_mora_90",
      tipo: "cartera",
      severidad: "critica",
      icono: "AlertOctagon",
      titulo: "Top cliente en mora > 90 dias",
      descripcion: `${topMora90[0]} adeuda ${formatCurrency(topMora90[1])}`,
      monto: Math.round(topMora90[1]),
      magnitud: topMora90[1]
    });
  }

  const carteraActual = rows.reduce((sum, row) => sum + getOutstandingAsOf(row, currentCutoff, 30), 0);
  const carteraPrevia = rows.reduce((sum, row) => sum + getOutstandingAsOf(row, thirtyDaysAgo, 30), 0);
  const variacionCartera = computeChange(carteraActual, carteraPrevia);
  if (variacionCartera > 20) {
    alerts.push({
      id: "cartera_aumento_bruscoid",
      tipo: "cartera",
      severidad: variacionCartera > 30 ? "critica" : "advertencia",
      icono: "TrendingUp",
      titulo: `Cartera vencida subio ${formatPercent(variacionCartera)}`,
      descripcion: `De ${formatCurrency(carteraPrevia)} a ${formatCurrency(carteraActual)} en un mes`,
      monto: Math.round(carteraActual),
      magnitud: variacionCartera
    });
  }

  if (carteraCriticaTotal > 50_000_000) {
    alerts.push({
      id: "cartera_mora_critica",
      tipo: "cartera",
      severidad: carteraCriticaTotal > 100_000_000 ? "critica" : "advertencia",
      icono: "AlertCircle",
      titulo: "Monto en mora critica",
      descripcion: `${formatCurrency(carteraCriticaTotal)} en facturas con > 90 dias sin pago`,
      monto: Math.round(carteraCriticaTotal),
      magnitud: carteraCriticaTotal
    });
  }

  for (const empresa of HOLDING_EMPRESAS) {
    const empresaRows = rows.filter((row) => row.empresa === empresa && row.fechaElaboracion);
    const actualMesCompleto = empresaRows
      .filter((row) => inRange(row.fechaElaboracion, { start: lastCompleteMonthStart, end: lastCompleteMonthEnd }))
      .reduce((sum, row) => sum + row.debito, 0);
    const historico = previousSixCompleteMonths.map((month) =>
      empresaRows
        .filter((row) => inRange(row.fechaElaboracion, { start: month.start, end: month.end }))
        .reduce((sum, row) => sum + row.debito, 0)
    );
    const promedio = computeHistoricalAverage(historico);

    if (promedio >= 5_000_000 && actualMesCompleto < promedio * 0.7) {
      const variacion = Number((((promedio - actualMesCompleto) / promedio) * 100).toFixed(1));
      alerts.push({
        id: `facturacion_caida_empresa_${empresa.toLowerCase()}`,
        tipo: "facturacion",
        severidad: "advertencia",
        icono: "TrendingDown",
        titulo: `Facturacion de ${empresa} bajo ${formatPercent(variacion)}`,
        descripcion: `De ${formatCurrency(promedio)} promedio a ${formatCurrency(actualMesCompleto)} este mes`,
        monto: Math.round(actualMesCompleto),
        magnitud: variacion
      });
    }
  }

  const currentPeriodRows = rows.filter((row) => row.fechaElaboracion && inRange(row.fechaElaboracion, current) && row.debito > 0);
  const currentFacturacion = currentPeriodRows.reduce((sum, row) => sum + row.debito, 0);
  const facturacionPorCliente = new Map<string, number>();
  for (const row of currentPeriodRows) {
    facturacionPorCliente.set(row.nombreTercero, (facturacionPorCliente.get(row.nombreTercero) ?? 0) + row.debito);
  }
  const topCliente = [...facturacionPorCliente.entries()].sort((a, b) => b[1] - a[1])[0];

  if (topCliente && currentFacturacion > 0) {
    const share = Number(((topCliente[1] / currentFacturacion) * 100).toFixed(1));
    if (share > 40) {
      alerts.push({
        id: "concentracion_top_cliente",
        tipo: "facturacion",
        severidad: "advertencia",
        icono: "Users",
        titulo: "Concentracion en un cliente",
        descripcion: `${topCliente[0]} representa el ${formatPercent(share)} de la facturacion`,
        monto: Math.round(topCliente[1]),
        magnitud: share
      });
    }

    alerts.push({
      id: "top_cliente_holding",
      tipo: "facturacion",
      severidad: "informativa",
      icono: "Star",
      titulo: "Top cliente del periodo",
      descripcion: `${topCliente[0]}: ${formatCurrency(topCliente[1])}`,
      monto: Math.round(topCliente[1]),
      magnitud: topCliente[1]
    });
  }

  const currentRecaudo = rows
    .filter((row) => row.fechaPago && inRange(row.fechaPago, current) && row.valorPagado > 0)
    .reduce((sum, row) => sum + row.valorPagado, 0);
  const ratioActual = currentFacturacion > 0 ? currentRecaudo / currentFacturacion : 0;
  const historicalRatios = previousSixCompleteMonths
    .map((month) => {
      const facturacion = rows
        .filter((row) => row.fechaElaboracion && inRange(row.fechaElaboracion, { start: month.start, end: month.end }) && row.debito > 0)
        .reduce((sum, row) => sum + row.debito, 0);
      if (facturacion <= 0) return 0;

      const recaudo = rows
        .filter((row) => row.fechaPago && inRange(row.fechaPago, { start: month.start, end: month.end }) && row.valorPagado > 0)
        .reduce((sum, row) => sum + row.valorPagado, 0);

      return recaudo / facturacion;
    })
    .filter((ratio) => ratio > 0);
  const ratioHistorico = historicalRatios.length > 0 ? sumValues(historicalRatios) / historicalRatios.length : 0;

  if (ratioActual > 0 && ratioHistorico > 0 && ratioActual < ratioHistorico * 0.7) {
    alerts.push({
      id: "ratio_recaudo_bajo",
      tipo: "recaudo",
      severidad: "advertencia",
      icono: "AlertTriangle",
      titulo: "Recaudo por debajo del historico",
      descripcion: `Ratio recaudo/facturacion: ${formatPercent(ratioActual * 100)} (historico: ${formatPercent(ratioHistorico * 100)})`,
      monto: null,
      magnitud: Number((((ratioHistorico - ratioActual) / ratioHistorico) * 100).toFixed(1))
    });
  }

  const recentSixMonthRows = rows.filter(
    (row): row is RecaudoRow & { fechaElaboracion: Date } =>
      row.fechaElaboracion instanceof Date &&
      row.fechaElaboracion.getTime() >= recentSixMonthsWindowStart.getTime() &&
      row.fechaElaboracion.getTime() <= currentCutoff.getTime() &&
      row.debito > 0
  );
  const clientMonthActivity = new Map<string, Set<string>>();
  const clientHistoricalTotals = new Map<string, number>();
  const clientLastInvoice = new Map<string, Date>();

  for (const row of recentSixMonthRows) {
    const monthKey = formatMonthKey(row.fechaElaboracion);
    const currentMonths = clientMonthActivity.get(row.nombreTercero) ?? new Set<string>();
    currentMonths.add(monthKey);
    clientMonthActivity.set(row.nombreTercero, currentMonths);
    clientHistoricalTotals.set(row.nombreTercero, (clientHistoricalTotals.get(row.nombreTercero) ?? 0) + row.debito);

    const previousDate = clientLastInvoice.get(row.nombreTercero);
    if (!previousDate || row.fechaElaboracion.getTime() > previousDate.getTime()) {
      clientLastInvoice.set(row.nombreTercero, row.fechaElaboracion);
    }
  }

  const churnClients = [...clientMonthActivity.entries()]
    .filter(([client, months]) => months.size >= 3 && (clientLastInvoice.get(client)?.getTime() ?? 0) < sixtyDaysAgo.getTime())
    .map(([client]) => ({
      client,
      total: clientHistoricalTotals.get(client) ?? 0
    }))
    .sort((a, b) => b.total - a.total);

  if (churnClients.length > 0) {
    alerts.push({
      id: "clientes_churn",
      tipo: "clientes",
      severidad: "advertencia",
      icono: "UserX",
      titulo: `${churnClients.length} clientes sin facturacion reciente`,
      descripcion: `${churnClients.slice(0, 3).map((item) => item.client).join(", ")} llevan > 60 dias sin movimiento`,
      monto: null,
      magnitud: churnClients.length
    });
  }

  const firstInvoiceByClient = new Map<string, Date>();
  for (const row of rows) {
    if (!row.fechaElaboracion || row.debito <= 0) continue;
    const existing = firstInvoiceByClient.get(row.nombreTercero);
    if (!existing || row.fechaElaboracion.getTime() < existing.getTime()) {
      firstInvoiceByClient.set(row.nombreTercero, row.fechaElaboracion);
    }
  }

  const nuevosClientes = [...facturacionPorCliente.keys()].filter((client) => inRange(firstInvoiceByClient.get(client) ?? null, current));
  if (nuevosClientes.length > 0) {
    alerts.push({
      id: "clientes_nuevos",
      tipo: "clientes",
      severidad: "positiva",
      icono: "UserPlus",
      titulo: `${nuevosClientes.length} clientes nuevos en el periodo`,
      descripcion: "Primera facturacion registrada",
      monto: null,
      magnitud: nuevosClientes.length
    });
  }

  for (const empresa of HOLDING_EMPRESAS) {
    const latestInvoice = rows
      .filter((row) => row.empresa === empresa && row.fechaElaboracion)
      .sort((a, b) => (b.fechaElaboracion?.getTime() ?? 0) - (a.fechaElaboracion?.getTime() ?? 0))[0]?.fechaElaboracion;

    if (!latestInvoice || latestInvoice.getTime() < last7DaysAgo.getTime()) {
      const dias = latestInvoice ? daysBetween(latestInvoice, currentCutoff) : 999;
      alerts.push({
        id: `sin_movimiento_reciente_${empresa.toLowerCase()}`,
        tipo: "operacion",
        severidad: "informativa",
        icono: "Clock",
        titulo: `${empresa} sin facturacion reciente`,
        descripcion: `Sin nuevos registros en los ultimos ${dias} dias`,
        monto: null,
        magnitud: dias
      });
    }
  }

  return alerts
    .sort((a, b) => {
      const severityDiff = SEVERITY_ORDER[b.severidad] - SEVERITY_ORDER[a.severidad];
      if (severityDiff !== 0) return severityDiff;
      return b.magnitud - a.magnitud;
    })
    .slice(0, 4);
}

async function buildPlanillaAlert(today: Date): Promise<AlertResponseItem | null> {
  const supabase = createServerSupabase();
  const targetMes = today.getUTCMonth() + 1;
  const targetAnio = today.getUTCFullYear();

  const { data: companiasRows, error: companiasError } = await supabase
    .from("planillas_companias")
    .select("*")
    .eq("activo", true);
  if (companiasError) return null;

  const window = buildMonthWindow(targetMes, targetAnio, HISTORY_MONTHS);
  const orFilter = window.map(({ mes, anio }) => `and(mes.eq.${mes},anio.eq.${anio})`).join(",");
  const { data: planillaRows, error: planillaError } = await supabase
    .from("planillas")
    .select("compania,tipo,mes,anio,quincena1,fecha_q1,quincena2,fecha_q2")
    .or(orFilter);
  if (planillaError) return null;

  const companias: CompaniaInput[] = (companiasRows ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      nombre: String(r.nombre ?? "").trim(),
      tipo: String(r.tipo ?? "Seguros").trim() || "Seguros",
      frecuencia_quincenas: Number(r.frecuencia_quincenas) === 1 ? 1 : 2,
      alertas_activas: r.alertas_activas === undefined ? true : Boolean(r.alertas_activas)
    };
  });

  const allRows: PlanillaHistRow[] = (planillaRows ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      compania: String(r.compania ?? "").trim(),
      tipo: String(r.tipo ?? "Seguros").trim() || "Seguros",
      mes: Number(r.mes ?? 0),
      anio: Number(r.anio ?? 0),
      quincena1: Boolean(r.quincena1 ?? false),
      fecha_q1: r.fecha_q1 == null ? null : String(r.fecha_q1),
      quincena2: Boolean(r.quincena2 ?? false),
      fecha_q2: r.fecha_q2 == null ? null : String(r.fecha_q2)
    };
  });

  const current = allRows.filter((row) => row.mes === targetMes && row.anio === targetAnio);
  const history = allRows.filter((row) => !(row.mes === targetMes && row.anio === targetAnio));

  // computePlanillaAlerts compara con today.getDate()/getMonth()/getFullYear() (local);
  // construimos un Date local con el Y/M/D de Bogota para que isCurrentMonth sea correcto.
  const localToday = new Date(targetAnio, targetMes - 1, today.getUTCDate());

  const { summary } = computePlanillaAlerts({
    companias,
    history,
    current,
    targetMes,
    targetAnio,
    today: localToday
  });

  if (summary.overdueCount <= 0) return null;

  const nombres = summary.companiasOverdue.slice(0, 3).join(", ");
  const resto = summary.companiasOverdue.length > 3 ? ` y ${summary.companiasOverdue.length - 3} más` : "";
  return {
    id: "planillas_pendientes_facturar",
    tipo: "operacion",
    severidad: summary.overdueCount >= 5 ? "critica" : "advertencia",
    icono: "AlertTriangle",
    titulo: `${summary.overdueCount} quincena(s) sin enviar a facturar`,
    descripcion: nombres ? `Atrasadas según su cadencia: ${nombres}${resto}` : "Hay quincenas atrasadas según su cadencia habitual",
    monto: null,
    magnitud: summary.overdueCount
  };
}

export async function GET(request: NextRequest) {
  try {
    const sessionData = await requireSession();
    if (
      sessionData.user.rol !== "admin" &&
      sessionData.user.rol !== "gerencia" &&
      !sessionData.session.modulos.includes("resumen")
    ) {
      return forbiddenResponse();
    }
  } catch {
    return unauthorizedResponse();
  }

  const periodParam = request.nextUrl.searchParams.get("period") ?? "current-month";
  if (!isPeriodKey(periodParam)) {
    return NextResponse.json({ detail: "Periodo no valido" }, { status: 400 });
  }

  if (isPortfolioDemoMode()) {
    return NextResponse.json(getDemoAlertasPayload(periodParam));
  }

  try {
    const today = getBogotaToday();
    const rows = await fetchAlertRows();
    const alerts = buildAlerts(rows, periodParam, today);

    // La alerta de planillas pendientes de facturar solo aplica al mes en curso.
    let finalAlerts = alerts;
    if (periodParam === "current-month") {
      const planillaAlert = await buildPlanillaAlert(today);
      if (planillaAlert) {
        finalAlerts = [planillaAlert, ...alerts].slice(0, 4);
      }
    }

    return NextResponse.json({
      period: periodParam,
      cutoff: formatDateOnly(today),
      alerts: finalAlerts,
      all_clear: finalAlerts.length === 0
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No fue posible calcular las alertas";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
