import { NextResponse } from "next/server";

import { CARTERA_EMPRESAS } from "@/lib/cartera-facturas";
import { getDemoTercerosSugeridos } from "@/lib/demo-cartera";
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
    const q = String(searchParams.get("q") ?? "").trim();
    const empresa = String(searchParams.get("empresa") ?? "").trim().toUpperCase();

    if (!q || q.length < 2) {
      return NextResponse.json({ sugerencias: [] });
    }

    if (!CARTERA_EMPRESAS.includes(empresa as (typeof CARTERA_EMPRESAS)[number])) {
      return NextResponse.json({ detail: "Empresa no valida" }, { status: 400 });
    }

    if (isPortfolioDemoMode()) {
      return NextResponse.json({ sugerencias: getDemoTercerosSugeridos(q, empresa) });
    }

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("recaudos")
      .select("nombre_tercero")
      .eq("empresa", empresa)
      .ilike("nombre_tercero", `%${q}%`)
      .limit(50);

    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    const seen = new Set<string>();
    const sugerencias = (data ?? [])
      .map((row) => String((row as { nombre_tercero?: string }).nombre_tercero ?? "").trim())
      .filter((value) => {
        if (!value) return false;
        const key = value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 10);

    return NextResponse.json({ sugerencias });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No fue posible consultar sugerencias";
    return NextResponse.json({ detail }, { status: 400 });
  }
}
