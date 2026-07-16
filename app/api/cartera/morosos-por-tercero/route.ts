import { NextResponse } from "next/server";

import { buildMorososPorTercero } from "@/lib/cartera-recordatorios";
import { getDemoMorososPorTercero } from "@/lib/demo-cartera";
import { isPortfolioDemoMode } from "@/lib/env";
import { canEdit, forbiddenResponse, requireSession, unauthorizedResponse } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
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
    if (isPortfolioDemoMode()) {
      return NextResponse.json(getDemoMorososPorTercero());
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
        .eq("estado", "PENDIENTE"),
      supabase
        .from("directorio")
        .select("id,nombre"),
      supabase
        .from("directorio_contactos")
        .select("directorio_id,rol,email"),
      supabase
        .from("contactos_empresa")
        .select("empresa,razon_social,email,activo")
        .in("empresa", ["SYSO", "SANUM"])
    ]);

    const error = recaudosError ?? directorioError ?? directorioContactosError ?? contactosError;
    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    const items = buildMorososPorTercero(
      ((recaudos ?? []) as Record<string, unknown>[]),
      ((directorio ?? []) as Record<string, unknown>[]),
      ((directorioContactos ?? []) as Record<string, unknown>[]),
      ((contactos ?? []) as Record<string, unknown>[])
    );

    return NextResponse.json(items);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No fue posible consultar los terceros morosos";
    return NextResponse.json({ detail }, { status: 400 });
  }
}
