import { NextResponse } from "next/server";

import { buildRecordatorioDetalle, parseReminderEmpresa } from "@/lib/cartera-recordatorios";
import { getDemoRecordatorioDetalle } from "@/lib/demo-cartera";
import { isPortfolioDemoMode } from "@/lib/env";
import { canEdit, forbiddenResponse, requireSession, unauthorizedResponse } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(request: Request) {
  let sessionData;
  try {
    sessionData = await requireSession();
  } catch {
    return unauthorizedResponse();
  }

  if (!canEdit(sessionData.session, "cartera")) {
    return forbiddenResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const tercero = String(searchParams.get("tercero") ?? "").trim();
    const empresa = parseReminderEmpresa(searchParams.get("empresa"));

    if (!tercero) {
      return NextResponse.json({ detail: "El tercero es obligatorio" }, { status: 400 });
    }

    if (isPortfolioDemoMode()) {
      return NextResponse.json(getDemoRecordatorioDetalle(tercero, empresa));
    }

    const supabase = createServerSupabase();
    const [
      { data: recaudos, error: recaudosError },
      { data: directorio, error: directorioError },
      { data: directorioContactos, error: directorioContactosError },
      { data: contactos, error: contactosError }
    ] = await Promise.all([
      supabase
        .from("recaudos")
        .select("empresa,nombre_tercero,numero_factura,fecha_elaboracion,debito,estado,tipo")
        .eq("empresa", empresa)
        .eq("estado", "PENDIENTE")
        .eq("nombre_tercero", tercero),
      supabase
        .from("directorio")
        .select("id,nombre"),
      supabase
        .from("directorio_contactos")
        .select("directorio_id,rol,email"),
      supabase
        .from("contactos_empresa")
        .select("empresa,razon_social,email,activo")
        .eq("empresa", empresa === "CMYM" ? "SYSO" : empresa)
    ]);

    const error = recaudosError ?? directorioError ?? directorioContactosError ?? contactosError;
    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    const payload = buildRecordatorioDetalle(
      tercero,
      empresa,
      ((recaudos ?? []) as Record<string, unknown>[]),
      ((directorio ?? []) as Record<string, unknown>[]),
      ((directorioContactos ?? []) as Record<string, unknown>[]),
      ((contactos ?? []) as Record<string, unknown>[])
    );

    return NextResponse.json(payload);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No fue posible generar el recordatorio";
    return NextResponse.json({ detail }, { status: 400 });
  }
}
