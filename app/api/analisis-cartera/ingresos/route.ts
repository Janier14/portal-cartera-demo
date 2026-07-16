import { NextRequest, NextResponse } from "next/server";

import { forbiddenResponse, requireSession, unauthorizedResponse } from "@/lib/auth";
import { getDemoIngresosPayload } from "@/lib/demo-analytics";
import { isPortfolioDemoMode } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";

type EmpresaCode = "TODAS" | "CMYM" | "SYSO" | "SANUM";
type CalculationMode = "pago" | "elaboracion";
type EmpresaBreakdown = Record<Exclude<EmpresaCode, "TODAS">, number>;

type RecaudoIngresoRow = {
  empresa: string | null;
  fecha_elaboracion: string | null;
  fecha_pago: string | null;
  valor_pagado: number | null;
  debito: number | null;
  estado: string | null;
};

type IngresoMes = {
  mes: string;
  valor: number;
  empresas?: EmpresaBreakdown;
};

function formatCutoffLabel(date: Date) {
  const month = new Intl.DateTimeFormat("es-CO", {
    month: "short",
    timeZone: "America/Bogota"
  })
    .format(date)
    .replace(".", "")
    .toUpperCase();

  return `${String(date.getDate()).padStart(2, "0")}-${month}-${date.getFullYear()}`;
}

const VALID_EMPRESAS: EmpresaCode[] = ["TODAS", "CMYM", "SYSO", "SANUM"];
const VALID_MODOS: CalculationMode[] = ["pago", "elaboracion"];

function isEmpresaCode(value: string): value is EmpresaCode {
  return VALID_EMPRESAS.includes(value as EmpresaCode);
}

function isCalculationMode(value: string): value is CalculationMode {
  return VALID_MODOS.includes(value as CalculationMode);
}

function isYearMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function parseDateOnly(value: string | null | undefined): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const iso = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const parsed = new Date(`${iso}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const slashParts = raw.split("/");
  if (slashParts.length === 3) {
    const [day, month, year] = slashParts;
    const parsed = new Date(`${year}-${month}-${day}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const dashParts = raw.split("-");
  if (dashParts.length === 3 && dashParts[0].length === 2) {
    const [day, month, year] = dashParts;
    const parsed = new Date(`${year}-${month}-${day}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildEmptyBreakdown(): EmpresaBreakdown {
  return { CMYM: 0, SYSO: 0, SANUM: 0 };
}

export async function GET(request: NextRequest) {
  let empresa: EmpresaCode = "TODAS";
  let modo: CalculationMode = "pago";

  try {
    const sessionData = await requireSession();
    if (sessionData.user.rol !== "admin" && !sessionData.session.modulos.includes("analisis-cartera")) {
      return forbiddenResponse();
    }
  } catch {
    return unauthorizedResponse();
  }

  try {
    const empresaParam = request.nextUrl.searchParams.get("empresa") ?? "TODAS";
    const modoParam = request.nextUrl.searchParams.get("modo") ?? "pago";
    const desde = request.nextUrl.searchParams.get("desde");
    const hasta = request.nextUrl.searchParams.get("hasta");

    if (!isEmpresaCode(empresaParam)) {
      return NextResponse.json({ detail: "Empresa no valida" }, { status: 400 });
    }
    if (!isCalculationMode(modoParam)) {
      return NextResponse.json({ detail: "Modo no valido" }, { status: 400 });
    }
    if (desde && !isYearMonth(desde)) {
      return NextResponse.json({ detail: "Parametro 'desde' no valido" }, { status: 400 });
    }
    if (hasta && !isYearMonth(hasta)) {
      return NextResponse.json({ detail: "Parametro 'hasta' no valido" }, { status: 400 });
    }
    if (desde && hasta && desde > hasta) {
      return NextResponse.json({ detail: "El rango de fechas no es valido" }, { status: 400 });
    }

    empresa = empresaParam;
    modo = modoParam;

    if (isPortfolioDemoMode()) {
      return NextResponse.json(getDemoIngresosPayload(empresa, modo));
    }

    const supabase = createServerSupabase();
    let query = supabase
      .from("recaudos")
      .select("empresa,fecha_elaboracion,fecha_pago,valor_pagado,debito,estado")
      .neq("estado", "ANULADA");

    if (empresa !== "TODAS") {
      query = query.eq("empresa", empresa);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as RecaudoIngresoRow[];
    const grouped = new Map<string, { total: number; empresas: EmpresaBreakdown }>();
    const desgloseEmpresas = buildEmptyBreakdown();
    let latestDate: Date | null = null;

    for (const row of rows) {
      const dateValue = modo === "pago" ? row.fecha_pago : row.fecha_elaboracion;
      const parsedDate = parseDateOnly(dateValue);
      if (!parsedDate) continue;

      const currentMonth = monthKey(parsedDate);
      if (desde && currentMonth < desde) continue;
      if (hasta && currentMonth > hasta) continue;

      const value = Math.max(0, Number(modo === "pago" ? row.valor_pagado ?? 0 : row.debito ?? 0));
      if (value <= 0) continue;
      if (!latestDate || parsedDate.getTime() > latestDate.getTime()) {
        latestDate = parsedDate;
      }

      const empresaRow = String(row.empresa ?? "").toUpperCase();
      const current = grouped.get(currentMonth) ?? { total: 0, empresas: buildEmptyBreakdown() };
      current.total += value;

      if (empresaRow === "CMYM" || empresaRow === "SYSO" || empresaRow === "SANUM") {
        current.empresas[empresaRow] += value;
        desgloseEmpresas[empresaRow] += value;
      }

      grouped.set(currentMonth, current);
    }

    const meses: IngresoMes[] = Array.from(grouped.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([mes, values]) => ({
        mes,
        valor: Math.round(values.total),
        ...(empresa === "TODAS" ? { empresas: values.empresas } : {})
      }));

    const totalIngresado = meses.reduce((sum, item) => sum + item.valor, 0);
    const promedioMensual = meses.length > 0 ? totalIngresado / meses.length : 0;
    const mejorMes =
      meses.reduce<IngresoMes | null>((best, item) => {
        if (!best || item.valor > best.valor) return item;
        return best;
      }, null) ?? { mes: "", valor: 0 };

    let variacionPeriodo: number | null = null;
    if (meses.length >= 12) {
      const previousPeriod = meses.slice(-12, -6).reduce((sum, item) => sum + item.valor, 0);
      const currentPeriod = meses.slice(-6).reduce((sum, item) => sum + item.valor, 0);
      if (previousPeriod === 0) {
        variacionPeriodo = currentPeriod > 0 ? 100 : 0;
      } else {
        variacionPeriodo = Number((((currentPeriod - previousPeriod) / previousPeriod) * 100).toFixed(1));
      }
    }

    return NextResponse.json({
      modo,
      empresa,
      cutoff_label: latestDate ? formatCutoffLabel(latestDate) : null,
      meses,
      kpis: {
        total_ingresado: Math.round(totalIngresado),
        promedio_mensual: Math.round(promedioMensual),
        mejor_mes: {
          mes: mejorMes.mes,
          valor: mejorMes.valor
        },
        variacion_periodo: variacionPeriodo
      },
      desglose_empresas: empresa === "TODAS" ? desgloseEmpresas : null
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No fue posible calcular ingresos";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
