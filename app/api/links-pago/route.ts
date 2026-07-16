import { NextResponse } from "next/server";

import { createDemoLinkPago, listDemoLinksPago } from "@/lib/demo-admin";
import { isPortfolioDemoMode } from "@/lib/env";
import { canEdit, forbiddenResponse, requireSession, unauthorizedResponse } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

function normalizeRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id ?? 0),
    aseguradora: String(row.aseguradora ?? "").trim(),
    url: String(row.url ?? "").trim()
  };
}

export async function GET() {
  try {
    await requireSession();
  } catch {
    return unauthorizedResponse();
  }

  if (isPortfolioDemoMode()) {
    return NextResponse.json({ links: listDemoLinksPago() });
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase.from("links_pago").select("*").order("aseguradora");
  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ links: (data ?? []).map((row) => normalizeRow(row as Record<string, unknown>)) });
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
    const aseguradora = String(body.aseguradora ?? "").trim();
    const url = String(body.url ?? "").trim();
    if (!aseguradora) throw new Error("La aseguradora es obligatoria");
    if (!url) throw new Error("La URL es obligatoria");

    if (isPortfolioDemoMode()) {
      return NextResponse.json({ ok: true, link: createDemoLinkPago({ aseguradora, url }) });
    }

    const supabase = createServerSupabase();
    const { data, error } = await supabase.from("links_pago").insert({ aseguradora, url }).select("*").limit(1);
    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, link: normalizeRow((data ?? [])[0] as Record<string, unknown>) });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No fue posible crear el link";
    return NextResponse.json({ detail }, { status: 400 });
  }
}
