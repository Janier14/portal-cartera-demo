import { NextResponse } from "next/server";

import { normalizeDirectorioContactoInput } from "@/lib/directorio";
import { canEdit, forbiddenResponse, requireSession, unauthorizedResponse } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

function parseDirectorioId(value: unknown) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("directorio_id invalido");
  }
  return id;
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
    const contacto = normalizeDirectorioContactoInput(body);
    const directorio_id = parseDirectorioId(body.directorio_id);
    const supabase = createServerSupabase();

    const { data, error } = await supabase
      .from("directorio_contactos")
      .insert({
        directorio_id,
        rol: contacto.rol,
        nombre: contacto.nombre,
        email: contacto.email || null,
        telefono: contacto.telefono || null,
        notas: contacto.notas || null
      })
      .select("id,directorio_id,rol,nombre,email,telefono,notas,created_at")
      .limit(1);

    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, contacto: (data ?? [])[0] ?? null });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No fue posible crear el contacto";
    return NextResponse.json({ detail }, { status: 400 });
  }
}
