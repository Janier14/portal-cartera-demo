import { redirect } from "next/navigation";

import { CarteraDashboard } from "@/components/modules/cartera-dashboard";
import { canEdit as canEditFn, getSessionLightweight } from "@/lib/auth";
import { getDemoCarteraPageData } from "@/lib/demo-cartera";
import { isPortfolioDemoMode } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";

function normalizeTipo(value: string) {
  const upper = String(value || "").trim().toUpperCase();
  if (upper.includes("ARL")) return "ARL";
  if (upper.includes("SALUD")) return "SALUD";
  return "Seguros";
}

export default async function CarteraPage() {
  const session = await getSessionLightweight();
  if (!session) redirect("/login");

  if (isPortfolioDemoMode()) {
    const demo = getDemoCarteraPageData();
    return (
      <CarteraDashboard
        recaudos={demo.recaudos}
        planillas={demo.planillas}
        canEdit={canEditFn(session, "cartera")}
        lastImportDate={demo.lastImportDate}
      />
    );
  }

  const supabase = createServerSupabase();
  const [{ data: recaudos }, { data: companiasRows }] = await Promise.all([
    supabase
      .from("recaudos")
      .select("nombre_tercero,debito,valor_pagado,fecha_elaboracion,fecha_pago,estado,tipo,numero_factura,mes,anio,empresa,detalle,codigo_contable,identificacion"),
    supabase
      .from("planillas_companias")
      .select("id,nombre,tipo,frecuencia_quincenas,activo")
      .eq("activo", true)
      .order("nombre")
  ]);

  const recaudosRows = ((recaudos ?? []) as never[]).map((row: any) => ({
    compania: row.nombre_tercero || "",
    valor: row.debito || 0,
    pagado: row.valor_pagado || 0,
    fecha_factura: row.fecha_elaboracion || "",
    fecha_pago: row.fecha_pago || "",
    estado: row.estado || "",
    tipo: row.tipo || "",
    numero_factura: row.numero_factura || "",
    mes: row.mes || "",
    anio: row.anio || "",
    empresa: row.empresa || "",
    detalle: row.detalle || "",
    codigo_contable: row.codigo_contable || "",
    identificacion: row.identificacion || ""
  }));

  const companias = ((companiasRows as { id: number; nombre: string; tipo: string; frecuencia_quincenas: number }[] | null) ?? []).map((row) => ({
    id: Number(row.id),
    nombre: String(row.nombre || "").trim(),
    tipo: normalizeTipo(row.tipo),
    frecuencia_quincenas: Number(row.frecuencia_quincenas) === 1 ? 1 : 2 as 1 | 2
  }));

  return (
    <CarteraDashboard
      recaudos={recaudosRows}
      planillas={{ companias }}
      canEdit={canEditFn(session, "cartera")}
    />
  );
}
