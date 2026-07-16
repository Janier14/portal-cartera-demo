import { NextRequest, NextResponse } from "next/server";

import { forbiddenResponse, requireSession, unauthorizedResponse } from "@/lib/auth";
import { getDemoResumenPayload } from "@/lib/demo-analytics";
import { isPortfolioDemoMode } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";

type PeriodKey = "current-month" | "rolling-3m" | "year-to-date";
type TrendDirection = "up" | "down" | "flat";
type EmpresaCode = "CMYM" | "SYSO" | "SANUM";

type Range = {
  start: Date;
  end: Date;
};

type KpiResult = {
  value: number | null;
  previous_value: number | null;
  change_pct: number | null;
  valor_actual: number | null;
  valor_anterior: number | null;
  variacion_absoluta: number | null;
  variacion_porcentual: number | null;
  base_baja: boolean;
  direction: TrendDirection;
  favorable: boolean | null;
  error: string | null;
};

type CarteraKpiResult = KpiResult & {
  ratio_over_facturacion: number | null;
};

type ComparisonPeriod = {
  label: string;
};

type SparkPoint = {
  mes: string;
  valor: number;
};

type EmpresaBreakdownResult = KpiResult & {
  participacion: number | null;
  sparkline: SparkPoint[];
};

type EmpresaBreakdownPayload = {
  cutoff: string | null;
  cutoff_label: string | null;
  por_empresa: Record<EmpresaCode, EmpresaBreakdownResult>;
};

type RecaudoBaseRow = {
  empresa: string | null;
  estado: string | null;
  fecha_elaboracion: string | null;
  fecha_pago: string | null;
  debito: number | null;
  valor_pagado: number | null;
  nombre_tercero?: string | null;
};

const VALID_PERIODS: string[] = ["current-month", "rolling-3m", "year-to-date"];
const HOLDING_EMPRESAS: EmpresaCode[] = ["CMYM", "SYSO", "SANUM"];

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

function formatCutoffLabel(date: Date) {
  const month = new Intl.DateTimeFormat("es-CO", {
    month: "short",
    timeZone: "America/Bogota"
  })
    .format(date)
    .replace(".", "")
    .toUpperCase();

  return `${String(date.getUTCDate()).padStart(2, "0")}-${month}-${date.getUTCFullYear()}`;
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

function computeChange(currentValue: number, previousValue: number): number {
  if (previousValue === 0) {
    return currentValue > 0 ? 100 : 0;
  }

  return Number((((currentValue - previousValue) / previousValue) * 100).toFixed(1));
}

function computeAbsoluteChange(currentValue: number, previousValue: number) {
  return Math.round(currentValue - previousValue);
}

function buildRecentCompleteMonths(referenceDate: Date) {
  const currentMonthStart = startOfUtcMonth(referenceDate);
  return Array.from({ length: 6 }, (_, index) => {
    const start = startOfUtcMonth(addUtcMonths(currentMonthStart, index - 6));
    return {
      key: formatMonthKey(start),
      start,
      end: endOfUtcMonth(start)
    };
  });
}

function computeHistoricalAverage(values: number[]) {
  const positiveValues = values.filter((value) => value > 0);
  if (positiveValues.length === 0) return 0;
  return positiveValues.reduce((sum, value) => sum + value, 0) / positiveValues.length;
}

function isLowBase(previousValue: number, historicalAverage: number) {
  if (historicalAverage <= 0) return false;
  return previousValue < historicalAverage * 0.2;
}

function resolveDirection(change: number): TrendDirection {
  if (change > 0) return "up";
  if (change < 0) return "down";
  return "flat";
}

function buildKpiResult(currentValue: number, previousValue: number, favorableWhenIncrease: boolean, historicalAverage = 0): KpiResult {
  const change = computeChange(currentValue, previousValue);
  const absoluteChange = computeAbsoluteChange(currentValue, previousValue);
  const direction = resolveDirection(change);
  const currentRounded = Math.round(currentValue);
  const previousRounded = Math.round(previousValue);
  const lowBase = isLowBase(previousValue, historicalAverage);

  return {
    value: currentRounded,
    previous_value: previousRounded,
    change_pct: change,
    valor_actual: currentRounded,
    valor_anterior: previousRounded,
    variacion_absoluta: absoluteChange,
    variacion_porcentual: change,
    base_baja: lowBase,
    direction,
    favorable: direction === "flat" ? null : favorableWhenIncrease ? change >= 0 : change <= 0,
    error: null
  };
}

function buildErrorResult(message: string): KpiResult {
  return {
    value: null,
    previous_value: null,
    change_pct: null,
    valor_actual: null,
    valor_anterior: null,
    variacion_absoluta: null,
    variacion_porcentual: null,
    base_baja: false,
    direction: "flat",
    favorable: null,
    error: message
  };
}

function normalizeEmpresa(value: string | null | undefined): EmpresaCode | null {
  const empresa = String(value ?? "").trim().toUpperCase();
  return HOLDING_EMPRESAS.includes(empresa as EmpresaCode) ? (empresa as EmpresaCode) : null;
}

function buildEmptySparkline(endDate: Date): SparkPoint[] {
  const currentMonth = startOfUtcMonth(endDate);
  return Array.from({ length: 6 }, (_, index) => {
    const monthDate = addUtcMonths(currentMonth, index - 5);
    return { mes: formatMonthKey(monthDate), valor: 0 };
  });
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

function formatShortMonth(date: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    month: "short",
    timeZone: "America/Bogota"
  })
    .format(date)
    .replace(".", "")
    .replace(/^\w/, (char) => char.toUpperCase());
}

function buildComparisonPeriod(period: string, current: Range, previous: Range): ComparisonPeriod {
  if (period === "current-month" || /^\d{4}-\d{2}$/.test(period)) {
    return {
      label: `${formatShortMonth(current.start)} ${current.start.getUTCDate()}-${current.end.getUTCDate()} vs ${formatShortMonth(previous.start)} ${previous.start.getUTCDate()}-${previous.end.getUTCDate()}`
    };
  }

  if (period === "rolling-3m" || /^range:\d{4}-\d{2}:\d{4}-\d{2}$/.test(period)) {
    if (current.start.getUTCFullYear() === current.end.getUTCFullYear()) {
      return {
        label: `${formatShortMonth(current.start)}-${formatShortMonth(current.end)} vs ${formatShortMonth(previous.start)}-${formatShortMonth(previous.end)}`
      };
    }
    return {
      label: `${formatShortMonth(current.start)} ${current.start.getUTCFullYear()}-${formatShortMonth(current.end)} ${current.end.getUTCFullYear()} vs prev.`
    };
  }

  return {
    label: `${formatShortMonth(current.start)}-${formatShortMonth(current.end)} vs ${formatShortMonth(previous.start)}-${formatShortMonth(previous.end)} ${previous.end.getUTCFullYear()}`
  };
}

function getOutstandingAsOf(row: RecaudoBaseRow, cutoff: Date) {
  const fechaElaboracion = parseDateOnly(row.fecha_elaboracion);
  if (!fechaElaboracion) return 0;

  const agingThreshold = addUtcDays(cutoff, -30);
  if (fechaElaboracion.getTime() >= agingThreshold.getTime()) return 0;

  const debito = Math.max(0, Number(row.debito ?? 0));
  if (debito <= 0) return 0;

  const fechaPago = parseDateOnly(row.fecha_pago);
  const pagoRegistrado = Math.max(0, Number(row.valor_pagado ?? 0));
  const pagoAplicable = fechaPago && fechaPago.getTime() <= cutoff.getTime() ? Math.min(pagoRegistrado, debito) : 0;
  const saldo = debito - pagoAplicable;

  return saldo > 0 ? saldo : 0;
}

async function fetchFacturacionKpi(rangeCurrent: Range, rangePrevious: Range) {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("recaudos")
    .select("empresa,estado,fecha_elaboracion,debito")
    .in("empresa", HOLDING_EMPRESAS)
    .neq("estado", "ANULADA");

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as RecaudoBaseRow[];
  const historyMonths = buildRecentCompleteMonths(rangeCurrent.end);
  const historyByMonth = Object.fromEntries(historyMonths.map((month) => [month.key, 0]));
  const current = rows.reduce((sum, row) => {
    const estadoNormalizado = String(row.estado ?? "").trim().toUpperCase();
    if (estadoNormalizado === "ANULADA") return sum;
    const date = parseDateOnly(row.fecha_elaboracion);
    if (!inRange(date, rangeCurrent)) return sum;
    return sum + Math.max(0, Number(row.debito ?? 0));
  }, 0);

  const previous = rows.reduce((sum, row) => {
    const estadoNormalizado = String(row.estado ?? "").trim().toUpperCase();
    if (estadoNormalizado === "ANULADA") return sum;
    const date = parseDateOnly(row.fecha_elaboracion);
    if (!inRange(date, rangePrevious)) return sum;
    return sum + Math.max(0, Number(row.debito ?? 0));
  }, 0);

  for (const row of rows) {
    const estadoNormalizado = String(row.estado ?? "").trim().toUpperCase();
    if (estadoNormalizado === "ANULADA") continue;
    const date = parseDateOnly(row.fecha_elaboracion);
    if (!date) continue;
    const value = Math.max(0, Number(row.debito ?? 0));
    if (value <= 0) continue;
    const monthKey = formatMonthKey(date);
    if (monthKey in historyByMonth) {
      historyByMonth[monthKey] += value;
    }
  }

  return buildKpiResult(current, previous, true, computeHistoricalAverage(Object.values(historyByMonth)));
}

async function fetchRecaudoKpi(rangeCurrent: Range, rangePrevious: Range) {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("recaudos")
    .select("empresa,estado,fecha_pago,valor_pagado")
    .in("empresa", HOLDING_EMPRESAS)
    .neq("estado", "ANULADA");

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as RecaudoBaseRow[];
  const historyMonths = buildRecentCompleteMonths(rangeCurrent.end);
  const historyByMonth = Object.fromEntries(historyMonths.map((month) => [month.key, 0]));
  const current = rows.reduce((sum, row) => {
    const estadoNormalizado = String(row.estado ?? "").trim().toUpperCase();
    if (estadoNormalizado === "ANULADA") return sum;
    const date = parseDateOnly(row.fecha_pago);
    const value = Math.max(0, Number(row.valor_pagado ?? 0));
    if (value <= 0 || !inRange(date, rangeCurrent)) return sum;
    return sum + value;
  }, 0);

  const previous = rows.reduce((sum, row) => {
    const estadoNormalizado = String(row.estado ?? "").trim().toUpperCase();
    if (estadoNormalizado === "ANULADA") return sum;
    const date = parseDateOnly(row.fecha_pago);
    const value = Math.max(0, Number(row.valor_pagado ?? 0));
    if (value <= 0 || !inRange(date, rangePrevious)) return sum;
    return sum + value;
  }, 0);

  for (const row of rows) {
    const estadoNormalizado = String(row.estado ?? "").trim().toUpperCase();
    if (estadoNormalizado === "ANULADA") continue;
    const date = parseDateOnly(row.fecha_pago);
    if (!date) continue;
    const value = Math.max(0, Number(row.valor_pagado ?? 0));
    if (value <= 0) continue;
    const monthKey = formatMonthKey(date);
    if (monthKey in historyByMonth) {
      historyByMonth[monthKey] += value;
    }
  }

  return buildKpiResult(current, previous, true, computeHistoricalAverage(Object.values(historyByMonth)));
}

async function fetchCarteraKpi(currentCutoff: Date, previousCutoff: Date) {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("recaudos")
    .select("empresa,estado,fecha_elaboracion,fecha_pago,debito,valor_pagado")
    .in("empresa", HOLDING_EMPRESAS)
    .neq("estado", "ANULADA");

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as RecaudoBaseRow[];
  const historyMonths = buildRecentCompleteMonths(currentCutoff);
  const current = rows.reduce((sum, row) => {
    const estadoNormalizado = String(row.estado ?? "").trim().toUpperCase();
    if (estadoNormalizado === "ANULADA") return sum;
    return sum + getOutstandingAsOf(row, currentCutoff);
  }, 0);
  const previous = rows.reduce((sum, row) => {
    const estadoNormalizado = String(row.estado ?? "").trim().toUpperCase();
    if (estadoNormalizado === "ANULADA") return sum;
    return sum + getOutstandingAsOf(row, previousCutoff);
  }, 0);
  const historyValues = historyMonths.map((month) =>
    rows.reduce((sum, row) => {
      const estadoNormalizado = String(row.estado ?? "").trim().toUpperCase();
      if (estadoNormalizado === "ANULADA") return sum;
      return sum + getOutstandingAsOf(row, month.end);
    }, 0)
  );

  return {
    ...buildKpiResult(current, previous, false, computeHistoricalAverage(historyValues)),
    ratio_over_facturacion: null
  } satisfies CarteraKpiResult;
}

async function fetchClientesKpi(rangeCurrent: Range, rangePrevious: Range) {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("recaudos")
    .select("empresa,estado,fecha_elaboracion,nombre_tercero")
    .in("empresa", HOLDING_EMPRESAS)
    .neq("estado", "ANULADA");

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as RecaudoBaseRow[];
  const currentClients = new Set<string>();
  const previousClients = new Set<string>();
  const historyMonths = buildRecentCompleteMonths(rangeCurrent.end);
  const historyClientSets = Object.fromEntries(historyMonths.map((month) => [month.key, new Set<string>()]));

  for (const row of rows) {
    const estadoNormalizado = String(row.estado ?? "").trim().toUpperCase();
    if (estadoNormalizado === "ANULADA") continue;

    const cliente = String(row.nombre_tercero ?? "").trim().toUpperCase();
    if (!cliente) continue;

    const date = parseDateOnly(row.fecha_elaboracion);
    if (inRange(date, rangeCurrent)) currentClients.add(cliente);
    if (inRange(date, rangePrevious)) previousClients.add(cliente);
    if (date) {
      const monthKey = formatMonthKey(date);
      if (monthKey in historyClientSets) {
        historyClientSets[monthKey].add(cliente);
      }
    }
  }

  return buildKpiResult(
    currentClients.size,
    previousClients.size,
    true,
    computeHistoricalAverage(Object.values(historyClientSets).map((clients) => clients.size))
  );
}

async function fetchEmpresaBreakdown(rangeCurrent: Range, rangePrevious: Range): Promise<EmpresaBreakdownPayload> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("recaudos")
    .select("empresa,estado,fecha_elaboracion,debito")
    .in("empresa", HOLDING_EMPRESAS)
    .neq("estado", "ANULADA");

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as RecaudoBaseRow[];
  const currentByEmpresa: Record<EmpresaCode, number> = { CMYM: 0, SYSO: 0, SANUM: 0 };
  const previousByEmpresa: Record<EmpresaCode, number> = { CMYM: 0, SYSO: 0, SANUM: 0 };
  const historyMonths = buildRecentCompleteMonths(rangeCurrent.end);
  const historyByEmpresa: Record<EmpresaCode, Record<string, number>> = {
    CMYM: Object.fromEntries(historyMonths.map((month) => [month.key, 0])),
    SYSO: Object.fromEntries(historyMonths.map((month) => [month.key, 0])),
    SANUM: Object.fromEntries(historyMonths.map((month) => [month.key, 0]))
  };

  const sparklineEndMonth = startOfUtcMonth(rangeCurrent.end);
  const sparklineStartMonth = startOfUtcMonth(addUtcMonths(sparklineEndMonth, -5));
  const sparklineEndRange = endOfUtcMonth(sparklineEndMonth);
  const sparklineByEmpresa: Record<EmpresaCode, Record<string, number>> = {
    CMYM: {},
    SYSO: {},
    SANUM: {}
  };
  let latestDate: Date | null = null;

  for (const row of rows) {
    const empresa = normalizeEmpresa(row.empresa);
    if (!empresa) continue;

    const estadoNormalizado = String(row.estado ?? "").trim().toUpperCase();
    if (estadoNormalizado === "ANULADA") continue;

    const date = parseDateOnly(row.fecha_elaboracion);
    if (!date) continue;

    const value = Math.max(0, Number(row.debito ?? 0));
    if (value <= 0) continue;
    if (!latestDate || date.getTime() > latestDate.getTime()) {
      latestDate = date;
    }

    if (inRange(date, rangeCurrent)) {
      currentByEmpresa[empresa] += value;
    }

    if (inRange(date, rangePrevious)) {
      previousByEmpresa[empresa] += value;
    }

    const historyMonthKey = formatMonthKey(date);
    if (historyMonthKey in historyByEmpresa[empresa]) {
      historyByEmpresa[empresa][historyMonthKey] += value;
    }

    if (date.getTime() >= sparklineStartMonth.getTime() && date.getTime() <= sparklineEndRange.getTime()) {
      const monthKey = formatMonthKey(date);
      sparklineByEmpresa[empresa][monthKey] = (sparklineByEmpresa[empresa][monthKey] ?? 0) + value;
    }
  }

  const totalHolding = HOLDING_EMPRESAS.reduce((sum, empresa) => sum + currentByEmpresa[empresa], 0);
  const baseSparkline = buildEmptySparkline(rangeCurrent.end);

  return {
    cutoff: latestDate ? formatDateOnly(latestDate) : null,
    cutoff_label: latestDate ? formatCutoffLabel(latestDate) : null,
    por_empresa: HOLDING_EMPRESAS.reduce<Record<EmpresaCode, EmpresaBreakdownResult>>((acc, empresa) => {
      const currentValue = currentByEmpresa[empresa];
      const previousValue = previousByEmpresa[empresa];
      const sparkline = baseSparkline.map((point) => ({
        mes: point.mes,
        valor: Math.round(sparklineByEmpresa[empresa][point.mes] ?? 0)
      }));

      acc[empresa] = {
        ...buildKpiResult(currentValue, previousValue, true, computeHistoricalAverage(Object.values(historyByEmpresa[empresa]))),
        participacion: totalHolding > 0 ? Number(((currentValue / totalHolding) * 100).toFixed(1)) : null,
        sparkline
      };
      return acc;
    }, {} as Record<EmpresaCode, EmpresaBreakdownResult>)
  };
}

async function captureKpi<T>(fn: () => Promise<T>, onError: (message: string) => T) {
  try {
    return await fn();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No fue posible calcular el KPI";
    return onError(detail);
  }
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
    return NextResponse.json(getDemoResumenPayload(periodParam));
  }

  const today = getBogotaToday();
  const { current, previous } = buildPeriodRanges(periodParam, today);

  const [facturacion, recaudo, carteraBase, clientes, empresaBreakdown] = await Promise.all([
    captureKpi(() => fetchFacturacionKpi(current, previous), buildErrorResult),
    captureKpi(() => fetchRecaudoKpi(current, previous), buildErrorResult),
    captureKpi(() => fetchCarteraKpi(current.end, previous.end), (message) => ({ ...buildErrorResult(message), ratio_over_facturacion: null })),
    captureKpi(() => fetchClientesKpi(current, previous), buildErrorResult),
    captureKpi(
      () => fetchEmpresaBreakdown(current, previous),
      (message) =>
        ({
          cutoff: null,
          cutoff_label: null,
          por_empresa: HOLDING_EMPRESAS.reduce<Record<EmpresaCode, EmpresaBreakdownResult>>((acc, empresa) => {
            acc[empresa] = {
              ...buildErrorResult(message),
              participacion: null,
              sparkline: buildEmptySparkline(current.end)
            };
            return acc;
          }, {} as Record<EmpresaCode, EmpresaBreakdownResult>)
        } satisfies EmpresaBreakdownPayload)
    )
  ]);

  const ratioOverFacturacion =
    facturacion.value && facturacion.value > 0 && carteraBase.value !== null
      ? Number(((carteraBase.value / facturacion.value) * 100).toFixed(1))
      : null;

  return NextResponse.json({
    period: periodParam,
    cutoff: empresaBreakdown.cutoff ?? "",
    cutoff_label: empresaBreakdown.cutoff_label,
    comparison_period: buildComparisonPeriod(periodParam, current, previous),
    kpis: {
      facturacion_total: facturacion,
      recaudo_total: recaudo,
      cartera_vencida: {
        ...carteraBase,
        ratio_over_facturacion: ratioOverFacturacion
      },
      clientes_activos: clientes
    },
    por_empresa: empresaBreakdown.por_empresa
  });
}
