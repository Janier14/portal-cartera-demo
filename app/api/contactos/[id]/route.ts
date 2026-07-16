import { NextResponse } from "next/server";

import { deleteDemoDirectorio, updateDemoDirectorio } from "@/lib/demo-admin";
import { normalizeDirectorioContactosInput } from "@/lib/directorio";
import { isPortfolioDemoMode } from "@/lib/env";
import { canEdit, forbiddenResponse, requireSession, unauthorizedResponse } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function parseId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Id invalido");
  }
  return id;
}

function buildPayload(body: Record<string, unknown>) {
  const nombre = cleanString(body.nombre);
  if (!nombre) {
    throw new Error("El nombre es obligatorio");
  }

  return {
    nombre,
    tipo: cleanString(body.tipo) || "Seguros",
    notas: cleanString(body.notas_generales ?? body.notas),
    link_pago: cleanString(body.link_pago),
    contactos: normalizeDirectorioContactosInput(body.contactos)
  };
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  let sessionData;
  try {
    sessionData = await requireSession();
  } catch {
    return unauthorizedResponse();
  }

  if (!canEdit(sessionData.session, "directorio")) {
    return forbiddenResponse();
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const payload = buildPayload(body);

    if (isPortfolioDemoMode()) {
      const contacto = updateDemoDirectorio(parseId(params.id), payload);
      if (!contacto) {
        return NextResponse.json({ detail: "Aseguradora no encontrada" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, contacto });
    }

    const supabase = createServerSupabase();

    const { data, error } = await supabase.rpc("save_directorio_with_contactos", {
      p_directorio_id: parseId(params.id),
      p_nombre: payload.nombre,
      p_tipo: payload.tipo,
      p_link_pago: payload.link_pago,
      p_notas: payload.notas,
      p_contactos: payload.contactos
    });

    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!row) {
      return NextResponse.json({ detail: "Aseguradora no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, contacto: row });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No fue posible actualizar la aseguradora";
    return NextResponse.json({ detail }, { status: 400 });
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  let sessionData;
  try {
    sessionData = await requireSession();
  } catch {
    return unauthorizedResponse();
  }

  if (!canEdit(sessionData.session, "directorio")) {
    return forbiddenResponse();
  }

  try {
    if (isPortfolioDemoMode()) {
      const deleted = deleteDemoDirectorio(parseId(params.id));
      if (!deleted) {
        return NextResponse.json({ detail: "Aseguradora no encontrada" }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }

    const supabase = createServerSupabase();
    const { error } = await supabase.from("directorio").delete().eq("id", parseId(params.id));
    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No fue posible eliminar la aseguradora";
    return NextResponse.json({ detail }, { status: 400 });
  }
}
