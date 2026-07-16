import { NextResponse } from "next/server";

import { requireSession, unauthorizedResponse } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

function mapRecaudo(row: Record<string, unknown>) {
  return {
    compania: String(row.nombre_tercero ?? ""),
    valor: Number(row.debito ?? 0),
    pagado: Number(row.valor_pagado ?? 0),
    fecha_factura: String(row.fecha_elaboracion ?? ""),
    fecha_pago: String(row.fecha_pago ?? ""),
    estado: String(row.estado ?? ""),
    tipo: String(row.tipo ?? ""),
    numero_factura: String(row.numero_factura ?? ""),
    mes: row.mes ?? "",
    anio: row.anio ?? ""
  };
}

export async function GET() {
  try {
    await requireSession();
  } catch {
    return unauthorizedResponse();
  }

  try {
    const supabase = createServerSupabase();
    const { data, error } = await supabase.from("recaudos").select("*");
    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }
    return NextResponse.json((data ?? []).map((row) => mapRecaudo(row as Record<string, unknown>)));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No fue posible consultar recaudos";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
