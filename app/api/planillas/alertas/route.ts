import { NextRequest, NextResponse } from "next/server";

import { requireSession, unauthorizedResponse } from "@/lib/auth";
import { getDemoPlanillasAlertas } from "@/lib/demo-cartera";
import { isPortfolioDemoMode } from "@/lib/env";
import {
  buildMonthWindow,
  computePlanillaAlerts,
  HISTORY_MONTHS,
  type CompaniaInput,
  type PlanillaHistRow
} from "@/lib/planillas-alertas";
import { createServerSupabase } from "@/lib/supabase/server";

// Construye un Date en horario local del servidor con el Y/M/D de Bogota.
function getBogotaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "1970");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "01");
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "01");
  return new Date(year, month - 1, day);
}

export async function GET(request: NextRequest) {
  try {
    await requireSession();
  } catch {
    return unauthorizedResponse();
  }

  const mes = Number(request.nextUrl.searchParams.get("mes") ?? 0);
  const anio = Number(request.nextUrl.searchParams.get("anio") ?? 0);
  if (!mes || !anio) {
    return NextResponse.json({ detail: "mes y anio son obligatorios" }, { status: 400 });
  }

  if (isPortfolioDemoMode()) {
    return NextResponse.json(getDemoPlanillasAlertas(mes, anio));
  }

  const supabase = createServerSupabase();

  const { data: companiasRows, error: companiasError } = await supabase
    .from("planillas_companias")
    .select("*")
    .eq("activo", true);
  if (companiasError) {
    return NextResponse.json({ detail: companiasError.message }, { status: 500 });
  }

  const window = buildMonthWindow(mes, anio, HISTORY_MONTHS);
  const orFilter = window.map(({ mes: m, anio: a }) => `and(mes.eq.${m},anio.eq.${a})`).join(",");
  const { data: planillaRows, error: planillaError } = await supabase
    .from("planillas")
    .select("compania,tipo,mes,anio,quincena1,fecha_q1,quincena2,fecha_q2")
    .or(orFilter);
  if (planillaError) {
    return NextResponse.json({ detail: planillaError.message }, { status: 500 });
  }

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

  const current = allRows.filter((row) => row.mes === mes && row.anio === anio);
  const history = allRows.filter((row) => !(row.mes === mes && row.anio === anio));

  const { alerts, summary } = computePlanillaAlerts({
    companias,
    history,
    current,
    targetMes: mes,
    targetAnio: anio,
    today: getBogotaToday()
  });

  return NextResponse.json({ mes, anio, alerts, summary });
}
