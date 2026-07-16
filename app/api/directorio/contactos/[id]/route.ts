import { NextResponse } from "next/server";

import { normalizeDirectorioContactoInput } from "@/lib/directorio";
import { canEdit, forbiddenResponse, requireSession, unauthorizedResponse } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

function parseContactoId(value: string) {
  const id = String(value ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Id de contacto invalido");
  }
  return id;
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
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
    const supabase = createServerSupabase();

    const { data, error } = await supabase
      .from("directorio_contactos")
      .update({
        rol: contacto.rol,
        nombre: contacto.nombre,
        email: contacto.email || null,
        telefono: contacto.telefono || null,
        notas: contacto.notas || null
      })
      .eq("id", parseContactoId(params.id))
      .select("id,directorio_id,rol,nombre,email,telefono,notas,created_at")
      .limit(1);

    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }
    if (!(data ?? []).length) {
      return NextResponse.json({ detail: "Contacto no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, contacto: data[0] });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No fue posible actualizar el contacto";
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
    const supabase = createServerSupabase();
    const { error } = await supabase.from("directorio_contactos").delete().eq("id", parseContactoId(params.id));
    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No fue posible eliminar el contacto";
    return NextResponse.json({ detail }, { status: 400 });
  }
}
