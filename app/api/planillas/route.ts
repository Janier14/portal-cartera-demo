import { NextRequest, NextResponse } from "next/server";

import { buildAuditActor, recordAuditEvent } from "@/lib/audit";
import { getDemoPlanillas, saveDemoPlanilla } from "@/lib/demo-cartera";
import { isPortfolioDemoMode } from "@/lib/env";
import { requireSession, unauthorizedResponse } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

function dbToUi(row: Record<string, unknown>) {
  const q2 = Boolean(row.quincena2 ?? false);
  const legacyFact = Boolean(row.facturada ?? false);
  return {
    q1: Boolean(row.quincena1 ?? false),
    fq1: String(row.fecha_q1 ?? ""),
    q2,
    fq2: String(row.fecha_q2 ?? ""),
    fact_q1: Boolean(row.facturada_q1 ?? legacyFact),
    fact_q2: q2 ? Boolean(row.facturada_q2 ?? false) : false,
    obs: String(row.observaciones ?? "")
  };
}

function uiToDb(row: Record<string, unknown>) {
  const q2 = Boolean(row.q2 ?? false);
  const factQ1 = Boolean(row.fact_q1 ?? false);
  const factQ2 = Boolean(row.fact_q2 ?? false);
  return {
    compania: String(row.compania ?? ""),
    tipo: String(row.tipo ?? ""),
    mes: Number(row.mes ?? 0),
    anio: Number(row.anio ?? 0),
    quincena1: Boolean(row.q1 ?? false),
    fecha_q1: String(row.fq1 ?? "") || null,
    quincena2: q2,
    fecha_q2: String(row.fq2 ?? "") || null,
    facturada_q1: factQ1,
    facturada_q2: q2 ? factQ2 : false,
    facturada: q2 ? (factQ1 && factQ2) : factQ1,
    observaciones: String(row.obs ?? "")
  };
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
    return NextResponse.json(getDemoPlanillas(mes, anio));
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase.from("planillas").select("*").eq("mes", mes).eq("anio", anio);
  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }
  return NextResponse.json(Object.fromEntries((data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const key = `${String(r.compania ?? "")}||${String(r.tipo ?? "")}`;
    return [key, dbToUi(r)];
  })));
}

export async function POST(request: Request) {
  let sessionData: Awaited<ReturnType<typeof requireSession>>;
  try {
    sessionData = await requireSession();
  } catch {
    return unauthorizedResponse();
  }

  const body = (await request.json()) as Record<string, unknown>;

  if (isPortfolioDemoMode()) {
    saveDemoPlanilla(body);
    return NextResponse.json({ ok: true });
  }

  const supabase = createServerSupabase();
  const payload = uiToDb(body);
  const { data: existing } = await supabase
    .from("planillas")
    .select("*")
    .eq("compania", payload.compania)
    .eq("tipo", payload.tipo)
    .eq("mes", payload.mes)
    .eq("anio", payload.anio)
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("planillas").upsert(payload, { onConflict: "compania,tipo,mes,anio" });
  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }

  await recordAuditEvent({
    actor: buildAuditActor(sessionData),
    action: existing ? "update" : "create",
    entityType: "planilla",
    entityId: `${payload.compania}:${payload.tipo}:${payload.anio}-${payload.mes}`,
    module: "cartera",
    source: "web",
    summary: `${existing ? "Actualizo" : "Creo"} la planilla ${payload.compania} ${payload.tipo} ${payload.anio}-${payload.mes}`,
    before: existing,
    after: payload,
    request
  });

  return NextResponse.json({ ok: true });
}
