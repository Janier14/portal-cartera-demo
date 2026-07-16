import { NextResponse } from "next/server";

import { deleteDemoCompania, updateDemoCompania } from "@/lib/demo-cartera";
import { isPortfolioDemoMode } from "@/lib/env";
import { requireSession, unauthorizedResponse } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

const TIPOS_VALIDOS = new Set(["ARL", "Seguros", "SALUD"]);

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id ?? 0),
    nombre: cleanString(row.nombre),
    tipo: cleanString(row.tipo) || "Seguros",
    frecuencia_quincenas: Number(row.frecuencia_quincenas) === 1 ? 1 : 2,
    alertas_activas: row.alertas_activas === undefined ? true : Boolean(row.alertas_activas),
    portal_detalle: cleanString(row.portal_detalle),
    correo_remitente: cleanString(row.correo_remitente),
    correo_destino: cleanString(row.correo_destino),
    recepcion_notas: cleanString(row.recepcion_notas),
    activo: Boolean(row.activo ?? true)
  };
}

function buildPayload(body: Record<string, unknown>) {
  const nombre = cleanString(body.nombre);
  if (!nombre) throw new Error("El nombre es obligatorio");
  const tipo = cleanString(body.tipo) || "Seguros";
  if (!TIPOS_VALIDOS.has(tipo)) throw new Error("Tipo inválido");
  const frecuencia = Number(body.frecuencia_quincenas);
  if (frecuencia !== 1 && frecuencia !== 2) throw new Error("Frecuencia inválida");
  const alertasActivas = typeof body.alertas_activas === "boolean" ? body.alertas_activas : true;
  return {
    nombre,
    tipo,
    frecuencia_quincenas: frecuencia,
    alertas_activas: alertasActivas,
    portal_detalle: cleanString(body.portal_detalle),
    correo_remitente: cleanString(body.correo_remitente),
    correo_destino: cleanString(body.correo_destino),
    recepcion_notas: cleanString(body.recepcion_notas)
  };
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireSession();
  } catch {
    return unauthorizedResponse();
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;

    if (isPortfolioDemoMode()) {
      const compania = updateDemoCompania(Number(params.id), buildPayload(body));
      if (!compania) return NextResponse.json({ detail: "Compañía no encontrada" }, { status: 404 });
      return NextResponse.json({ ok: true, compania: normalizeRow(compania as unknown as Record<string, unknown>) });
    }

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("planillas_companias")
      .update(buildPayload(body))
      .eq("id", Number(params.id))
      .select("*")
      .limit(1);
    if (error) return NextResponse.json({ detail: error.message }, { status: 500 });
    if (!(data ?? []).length) return NextResponse.json({ detail: "Compañía no encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true, compania: normalizeRow(data![0] as Record<string, unknown>) });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No fue posible actualizar la compañía";
    return NextResponse.json({ detail }, { status: 400 });
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    await requireSession();
  } catch {
    return unauthorizedResponse();
  }

  if (isPortfolioDemoMode()) {
    const deleted = deleteDemoCompania(Number(params.id));
    if (!deleted) return NextResponse.json({ detail: "Compañía no encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("planillas_companias")
    .update({ activo: false })
    .eq("id", Number(params.id));
  if (error) return NextResponse.json({ detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
