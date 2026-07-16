import { NextRequest, NextResponse } from "next/server";

import { forbiddenResponse, requireSession, unauthorizedResponse } from "@/lib/auth";
import { getDemoComparativoPayload } from "@/lib/demo-analytics";
import { isPortfolioDemoMode } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";

type EmpresaCode = "CMYM" | "SYSO" | "SANUM";
type CalculationMode = "pago" | "elaboracion";

type RecaudoComparativoRow = {
  empresa: string | null;
  fecha_elaboracion: string | null;
  fecha_pago: string | null;
  valor_pagado: number | null;
  debito: number | null;
  estado: string | null;
};

type MejorMes = {
  mes: string;
  valor: number;
};

type EmpresaResumen = {
  total: number;
  promedio: number;
  mejor_mes: MejorMes;
  crecimiento: number | null;
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

const EMPRESAS: EmpresaCode[] = ["CMYM", "SYSO", "SANUM"];
const VALID_MODOS: CalculationMode[] = ["pago", "elaboracion"];

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

function normalizeEmpresa(value: string | null | undefined): EmpresaCode | null {
  const empresa = String(value ?? "").trim().toUpperCase();
  return EMPRESAS.includes(empresa as EmpresaCode) ? (empresa as EmpresaCode) : null;
}

function roundValue(value: number): number {
  return Math.round(value);
}

function buildEmptyEmpresaMeses(): Record<EmpresaCode, Record<string, number>> {
  return {
    CMYM: {},
    SYSO: {},
    SANUM: {}
  };
}

function buildResumenEmpresa(mesesDisponibles: string[], porMes: Record<string, number>): EmpresaResumen {
  const mesesConValor = mesesDisponibles.map((mes) => ({
    mes,
    valor: roundValue(porMes[mes] ?? 0)
  }));

  const total = mesesConValor.reduce((sum, item) => sum + item.valor, 0);
  const promedio = mesesConValor.length > 0 ? total / mesesConValor.length : 0;
  const mejorMes =
    mesesConValor.reduce<MejorMes>(
      (best, item) => {
        if (!best.mes || item.valor > best.valor) return item;
        return best;
      },
      { mes: "", valor: 0 }
    );

  let crecimiento: number | null = null;
  if (mesesDisponibles.length >= 6) {
    const previousMonths = mesesDisponibles.slice(-6, -3);
    const currentMonths = mesesDisponibles.slice(-3);
    const previousTotal = previousMonths.reduce((sum, mes) => sum + (porMes[mes] ?? 0), 0);
    const currentTotal = currentMonths.reduce((sum, mes) => sum + (porMes[mes] ?? 0), 0);

    if (previousTotal === 0) {
      crecimiento = currentTotal > 0 ? 100 : 0;
    } else {
      crecimiento = Number((((currentTotal - previousTotal) / previousTotal) * 100).toFixed(1));
    }
  }

  return {
    total: roundValue(total),
    promedio: roundValue(promedio),
    mejor_mes: mejorMes,
    crecimiento,
    por_mes: Object.fromEntries(mesesConValor.map((item) => [item.mes, item.valor]))
  };
}

export async function GET(request: NextRequest) {
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
    const modoParam = request.nextUrl.searchParams.get("modo") ?? "pago";
    const desde = request.nextUrl.searchParams.get("desde");
    const hasta = request.nextUrl.searchParams.get("hasta");

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

    modo = modoParam;

    if (isPortfolioDemoMode()) {
      return NextResponse.json(getDemoComparativoPayload(modo));
    }

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("recaudos")
      .select("empresa,fecha_elaboracion,fecha_pago,valor_pagado,debito,estado")
      .neq("estado", "ANULADA");

    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as RecaudoComparativoRow[];
    const mesesSet = new Set<string>();
    const porEmpresaMes = buildEmptyEmpresaMeses();
    let latestDate: Date | null = null;

    for (const row of rows) {
      const empresa = normalizeEmpresa(row.empresa);
      if (!empresa) continue;

      const dateValue = modo === "pago" ? row.fecha_pago : row.fecha_elaboracion;
      const parsedDate = parseDateOnly(dateValue);
      if (!parsedDate) continue;

      const mes = monthKey(parsedDate);
      if (desde && mes < desde) continue;
      if (hasta && mes > hasta) continue;

      const value = Math.max(0, Number(modo === "pago" ? row.valor_pagado ?? 0 : row.debito ?? 0));
      if (value <= 0) continue;
      if (!latestDate || parsedDate.getTime() > latestDate.getTime()) {
        latestDate = parsedDate;
      }

      mesesSet.add(mes);
      porEmpresaMes[empresa][mes] = (porEmpresaMes[empresa][mes] ?? 0) + value;
    }

    const mesesDisponibles = Array.from(mesesSet).sort((left, right) => left.localeCompare(right));
    const porEmpresa = {
      CMYM: buildResumenEmpresa(mesesDisponibles, porEmpresaMes.CMYM),
      SYSO: buildResumenEmpresa(mesesDisponibles, porEmpresaMes.SYSO),
      SANUM: buildResumenEmpresa(mesesDisponibles, porEmpresaMes.SANUM)
    };

    const totalHolding = EMPRESAS.reduce((sum, empresa) => sum + porEmpresa[empresa].total, 0);
    const participacion = {
      CMYM: totalHolding > 0 ? Number(((porEmpresa.CMYM.total / totalHolding) * 100).toFixed(1)) : 0,
      SYSO: totalHolding > 0 ? Number(((porEmpresa.SYSO.total / totalHolding) * 100).toFixed(1)) : 0,
      SANUM: totalHolding > 0 ? Number(((porEmpresa.SANUM.total / totalHolding) * 100).toFixed(1)) : 0
    };

    const empresasConCrecimiento = EMPRESAS.flatMap((empresa) => {
      const crecimiento = porEmpresa[empresa].crecimiento;
      return crecimiento === null ? [] : [{ empresa, porcentaje: crecimiento }];
    });

    const empresaMayorCrecimiento =
      empresasConCrecimiento.reduce<{ empresa: EmpresaCode; porcentaje: number } | null>((best, item) => {
        if (!best || item.porcentaje > best.porcentaje) return item;
        return best;
      }, null) ?? null;

    const empresaMejorMes =
      EMPRESAS.reduce<{ empresa: EmpresaCode; mes: string; valor: number } | null>((best, empresa) => {
        const mejorMes = porEmpresa[empresa].mejor_mes;
        if (!mejorMes.mes) return best;
        if (!best || mejorMes.valor > best.valor) {
          return { empresa, mes: mejorMes.mes, valor: mejorMes.valor };
        }
        return best;
      }, null);

    return NextResponse.json({
      modo,
      cutoff_label: latestDate ? formatCutoffLabel(latestDate) : null,
      meses_disponibles: mesesDisponibles,
      total_holding: roundValue(totalHolding),
      por_empresa: porEmpresa,
      participacion,
      empresa_mayor_crecimiento: empresaMayorCrecimiento,
      empresa_mejor_mes: empresaMejorMes
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No fue posible calcular el comparativo";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
