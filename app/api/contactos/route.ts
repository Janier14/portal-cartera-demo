import { NextResponse } from "next/server";

import {
  buildContactosPorDirectorio,
  normalizeDirectorioContactosInput,
  normalizeDirectorioRow
} from "@/lib/directorio";
import { createDemoDirectorio, listDemoDirectorio } from "@/lib/demo-admin";
import { isPortfolioDemoMode } from "@/lib/env";
import { canEdit, forbiddenResponse, requireSession, unauthorizedResponse } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

function cleanString(value: unknown) {
  return String(value ?? "").trim();
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

async function loadDirectorioRows(supabase: ReturnType<typeof createServerSupabase>) {
  const [{ data: directorio, error: directorioError }, { data: contactos, error: contactosError }] = await Promise.all([
    supabase
      .from("directorio")
      .select("id,nombre,responsable,correos,telefonos,tipo,notas,created_at,link_pago")
      .order("nombre"),
    supabase
      .from("directorio_contactos")
      .select("id,directorio_id,rol,nombre,email,telefono,notas,created_at")
      .order("rol")
      .order("nombre")
  ]);

  const error = directorioError ?? contactosError;
  if (error) {
    throw new Error(error.message);
  }

  const contactosMap = buildContactosPorDirectorio((contactos ?? []) as Record<string, unknown>[]);
  return (directorio ?? []).map((row) => normalizeDirectorioRow(row as Record<string, unknown>, contactosMap));
}

export async function GET() {
  try {
    await requireSession();
  } catch {
    return unauthorizedResponse();
  }

  try {
    if (isPortfolioDemoMode()) {
      return NextResponse.json({ contactos: listDemoDirectorio() });
    }

    const supabase = createServerSupabase();
    const contactos = await loadDirectorioRows(supabase);
    return NextResponse.json({ contactos });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No fue posible cargar el directorio";
    return NextResponse.json({ detail }, { status: 500 });
  }
}

export async function POST(request: Request) {
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
      const contacto = createDemoDirectorio(payload);
      return NextResponse.json({ ok: true, contacto });
    }

    const supabase = createServerSupabase();

    const { data, error } = await supabase.rpc("save_directorio_with_contactos", {
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
    const id = Number(row?.id ?? 0);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error("No fue posible identificar la aseguradora creada");
    }

    const contactos = await loadDirectorioRows(supabase);
    const contacto = contactos.find((item) => item.id === id);
    return NextResponse.json({ ok: true, contacto });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No fue posible crear la aseguradora";
    return NextResponse.json({ detail }, { status: 400 });
  }
}
