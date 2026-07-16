import { NextRequest, NextResponse } from "next/server";

import { forbiddenResponse, requireSession, unauthorizedResponse } from "@/lib/auth";
import { getDemoAportesPayload } from "@/lib/demo-analytics";
import { isPortfolioDemoMode } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";

type EmpresaCode = "TODAS" | "CMYM" | "SYSO" | "SANUM";
type CalculationMode = "pago" | "elaboracion";
type Tendencia = "subiendo" | "bajando" | "estable" | "nuevo";

type RecaudoClienteRow = {
  empresa: string | null;
  fecha_elaboracion: string | null;
  fecha_pago: string | null;
  valor_pagado: number | null;
  debito: number | null;
  estado: string | null;
  nombre_tercero: string | null;
};

type ClientePayload = {
  cliente: string;
  total: number;
  participacion: number;
  tendencia: Tendencia;
  por_mes: Record<string, number>;
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

function normalizeCliente(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function calcularTendencia(porMes: Record<string, number>): Tendencia {
  const months = Object.keys(porMes).sort();
  if (months.length < 2) return "nuevo";

  const currentMonths = months.slice(-3);
  const previousMonths = months.slice(-6, -3);

  if (currentMonths.length === 0 || previousMonths.length === 0) return "nuevo";

  const currentAverage = currentMonths.reduce((sum, month) => sum + (porMes[month] ?? 0), 0) / currentMonths.length;
  const previousAverage = previousMonths.reduce((sum, month) => sum + (porMes[month] ?? 0), 0) / previousMonths.length;

  if (previousAverage === 0) {
    return currentAverage > 0 ? "subiendo" : "nuevo";
  }

  if (currentAverage > previousAverage * 1.1) return "subiendo";
  if (currentAverage < previousAverage * 0.9) return "bajando";
  return "estable";
}

export async function GET(request: NextRequest) {
  let empresa: EmpresaCode = "TODAS";
  let modo: CalculationMode = "pago";

  try {
    const sessionData = await requireSession();
    const modulos = sessionData.session.modulos;
    if (sessionData.user.rol !== "admin" && !modulos.includes("analisis-cartera") && !modulos.includes("cartera")) {
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
      return NextResponse.json(getDemoAportesPayload(empresa, modo));
    }

    const supabase = createServerSupabase();
    let query = supabase
      .from("recaudos")
      .select("empresa,fecha_elaboracion,fecha_pago,valor_pagado,debito,estado,nombre_tercero")
      .neq("estado", "ANULADA");

    if (empresa !== "TODAS") {
      query = query.eq("empresa", empresa);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as RecaudoClienteRow[];
    const monthSet = new Set<string>();
    const grouped = new Map<string, Record<string, number>>();
    let latestDate: Date | null = null;

    for (const row of rows) {
      const cliente = normalizeCliente(row.nombre_tercero);
      if (!cliente) continue;

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

      monthSet.add(currentMonth);
      const current = grouped.get(cliente) ?? {};
      current[currentMonth] = (current[currentMonth] ?? 0) + value;
      grouped.set(cliente, current);
    }

    const mesesDisponibles = Array.from(monthSet).sort();
    const totals = Array.from(grouped.entries()).map(([cliente, por_mes]) => ({
      cliente,
      por_mes,
      total: Object.values(por_mes).reduce((sum, value) => sum + value, 0)
    }));

    const totalGeneral = totals.reduce((sum, item) => sum + item.total, 0);
    const todosClientes: ClientePayload[] = totals
      .map((item) => ({
        cliente: item.cliente,
        total: Math.round(item.total),
        participacion: totalGeneral > 0 ? Number(((item.total / totalGeneral) * 100).toFixed(1)) : 0,
        tendencia: calcularTendencia(item.por_mes),
        por_mes: Object.fromEntries(
          Object.entries(item.por_mes)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([mes, valor]) => [mes, Math.round(valor)])
        )
      }))
      .sort((a, b) => b.total - a.total || a.cliente.localeCompare(b.cliente, "es"));

    return NextResponse.json({
      modo,
      empresa,
      cutoff_label: latestDate ? formatCutoffLabel(latestDate) : null,
      meses_disponibles: mesesDisponibles,
      total_general: Math.round(totalGeneral),
      total_clientes: todosClientes.length,
      top_10: todosClientes.slice(0, 10),
      todos_clientes: todosClientes
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No fue posible calcular aportes por cliente";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
