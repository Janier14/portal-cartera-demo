import { NextRequest, NextResponse } from "next/server";

import { getDemoProjectionPayload } from "@/lib/demo-cartera";
import { isPortfolioDemoMode } from "@/lib/env";
import { requireSession, unauthorizedResponse } from "@/lib/auth";
import type { CarteraProjectionPayload, ProyeccionCompany, ProyeccionNoRecurrente, SemanasMes } from "@/lib/modules/cartera";
import { createServerSupabase } from "@/lib/supabase/server";

const MIN_MESES = 3;
const MONTH_NAMES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function cv(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return (Math.sqrt(variance) / mean) * 100;
}

function normalizeCompania(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, " ");
}

function monthKey(mes: number, anio: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

function nextMonthLabel(lastKey: string): string {
  const [y, m] = lastKey.split("-").map(Number);
  const date = new Date(y, m, 1); // m is already 1-based so this goes to next month
  return `${MONTH_NAMES[date.getMonth()]}-${date.getFullYear()}`;
}

// Returns the first Monday of the month (day 1-7)
function firstMondayOfMonth(year: number, month: number): number {
  for (let d = 1; d <= 7; d++) {
    if (new Date(year, month - 1, d).getDay() === 1) return d; // 1 = Monday
  }
  return 1;
}

function buildSemanasMes(year: number, month: number): SemanasMes[] {
  const lastDay = new Date(year, month, 0).getDate();
  const offset = firstMondayOfMonth(year, month) - 1; // days before first Monday
  const shortMonthName = MONTH_NAMES[month - 1].toLowerCase();

  const cuts = [
    offset + 1,
    offset + 8,
    offset + 15,
    offset + 22,
    lastDay + 1 // sentinel
  ];

  return ([1, 2, 3, 4] as const).map((semana, i) => {
    const desde = Math.min(cuts[i], lastDay);
    const hasta = Math.min(cuts[i + 1] - 1, lastDay);
    return {
      semana,
      desde,
      hasta,
      label: `${desde}-${hasta} ${shortMonthName}`
    };
  });
}

export async function GET(request: NextRequest) {
  try {
    await requireSession();
  } catch {
    return unauthorizedResponse();
  }

  try {
    const empresa = request.nextUrl.searchParams.get("empresa") ?? "TODAS";

    if (isPortfolioDemoMode()) {
      return NextResponse.json(getDemoProjectionPayload(empresa));
    }

    const supabase = createServerSupabase();
    const minAnio = new Date().getFullYear() - 1;
    let query = supabase
      .from("recaudos")
      .select("nombre_tercero,tipo,debito,estado,mes,anio,empresa,fecha_pago")
      .neq("estado", "ANULADA")
      .gte("anio", minAnio);

    if (empresa !== "TODAS") {
      query = query.eq("empresa", empresa);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as Array<{
      nombre_tercero: string;
      tipo: string;
      debito: number;
      estado: string;
      mes: number;
      anio: number;
      empresa: string;
      fecha_pago: string | null;
    }>;

    // Group by (compania_norm, tipo, mes+anio) — sum debito
    const grouped = new Map<string, Map<string, number>>();
    const weeklySums = new Map<string, [number, number, number, number]>();

    for (const row of rows) {
      const empresaRow = String(row.empresa ?? "").trim().toUpperCase();
      const compania = normalizeCompania(row.nombre_tercero ?? "");
      const tipo = String(row.tipo ?? "OTROS").toUpperCase();
      const mes = Number(row.mes);
      const anio = Number(row.anio);
      if (!empresaRow || !compania || !mes || !anio) continue;

      const groupKey = `${empresaRow}|||${compania}|||${tipo}`;
      const mk = monthKey(mes, anio);
      const val = Number(row.debito ?? 0);

      if (!grouped.has(groupKey)) grouped.set(groupKey, new Map());
      const monthMap = grouped.get(groupKey)!;
      monthMap.set(mk, (monthMap.get(mk) ?? 0) + val);

      if (!weeklySums.has(groupKey)) weeklySums.set(groupKey, [0, 0, 0, 0]);

      if (row.estado === "PAGADA" && row.fecha_pago) {
        let day = 0;
        const rawDate = String(row.fecha_pago).trim();
        if (rawDate.includes("/")) {
          day = parseInt(rawDate.split("/")[0], 10);
        } else if (rawDate.includes("-")) {
          const parts = rawDate.split("T")[0].split("-");
          if (parts.length === 3) day = parseInt(parts[2], 10);
        }
        
        if (!isNaN(day) && day > 0 && day <= 31) {
          let w = 0;
          if (day <= 7) w = 0;
          else if (day <= 14) w = 1;
          else if (day <= 21) w = 2;
          else w = 3;
          
          weeklySums.get(groupKey)![w] += val;
        }
      }
    }

    // Find last month in data
    let lastMonthKey = "2000-01";
    for (const monthMap of grouped.values()) {
      for (const mk of monthMap.keys()) {
        if (mk > lastMonthKey) lastMonthKey = mk;
      }
    }

    const proyecciones: ProyeccionCompany[] = [];
    const no_recurrentes: ProyeccionNoRecurrente[] = [];

    for (const [groupKey, monthMap] of grouped) {
      const [empresaRow, compania, tipo] = groupKey.split("|||");
      const historico: Record<string, number> = Object.fromEntries(monthMap);

      const allKeys = [...monthMap.keys()].sort();
      const mesesConValor = allKeys.filter((k) => (monthMap.get(k) ?? 0) > 0).length;

      const wSums = weeklySums.get(groupKey) ?? [0, 0, 0, 0];
      const totalWSums = wSums[0] + wSums[1] + wSums[2] + wSums[3];
      const distribucion_semanas: [number, number, number, number] = totalWSums > 0
        ? [wSums[0] / totalWSums, wSums[1] / totalWSums, wSums[2] / totalWSums, wSums[3] / totalWSums]
        : [0.25, 0.25, 0.25, 0.25];

      if (mesesConValor < MIN_MESES) {
        const total = [...monthMap.values()].reduce((s, v) => s + v, 0);
        no_recurrentes.push({ empresa: empresaRow, compania, tipo, total, n_meses: mesesConValor, historico, distribucion_semanas });
        continue;
      }

      // Use last 6 months (or all if fewer)
      const recentKeys = allKeys.slice(-6);
      const valsCalc = recentKeys.map((k) => monthMap.get(k) ?? 0);
      const valsActivos = valsCalc.filter((v) => v > 0);

      // IQR outlier removal
      let valsSinOutliers = valsActivos;
      let outlierCount = 0;
      if (valsActivos.length >= 4) {
        const q1 = percentile(valsActivos, 25);
        const q3 = percentile(valsActivos, 75);
        const iqr = q3 - q1;
        const lower = q1 - 1.5 * iqr;
        const upper = q3 + 1.5 * iqr;
        const filtered = valsActivos.filter((v) => v >= lower && v <= upper);
        if (filtered.length > 0) {
          outlierCount = valsActivos.length - filtered.length;
          valsSinOutliers = filtered;
        }
      }

      const proyeccion = Math.round(median(valsSinOutliers.length > 0 ? valsSinOutliers : valsActivos));
      const variacion = parseFloat(cv(valsCalc).toFixed(1));
      const estabilidad: "ALTA" | "MEDIA" | "BAJA" =
        variacion < 15 ? "ALTA" : variacion < 40 ? "MEDIA" : "BAJA";

      proyecciones.push({
        empresa: empresaRow,
        compania,
        tipo,
        proyeccion,
        variacion,
        estabilidad,
        n_meses: allKeys.length,
        outliers: outlierCount,
        historico,
        distribucion_semanas
      });
    }

    // Sort by proyeccion desc
    proyecciones.sort((a, b) => b.proyeccion - a.proyeccion);

    const total_proyectado = proyecciones.reduce((s, p) => s + p.proyeccion, 0);
    const total_alta = proyecciones.filter((p) => p.estabilidad === "ALTA").reduce((s, p) => s + p.proyeccion, 0);
    const total_media = proyecciones.filter((p) => p.estabilidad === "MEDIA").reduce((s, p) => s + p.proyeccion, 0);
    const total_baja = proyecciones.filter((p) => p.estabilidad === "BAJA").reduce((s, p) => s + p.proyeccion, 0);
    const mes_proyeccion = nextMonthLabel(lastMonthKey);

    // Build dynamic week boundaries for the projected month
    const [projYear, projMonth] = lastMonthKey.split("-").map(Number);
    const nextDate = new Date(projYear, projMonth, 1);
    const semanas_mes = buildSemanasMes(nextDate.getFullYear(), nextDate.getMonth() + 1);

    const payload: CarteraProjectionPayload = {
      proyecciones,
      no_recurrentes,
      total_proyectado,
      total_alta,
      total_media,
      total_baja,
      mes_proyeccion,
      semanas_mes
    };

    return NextResponse.json(payload);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No fue posible calcular proyección";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
