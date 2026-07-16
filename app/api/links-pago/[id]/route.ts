import { NextResponse } from "next/server";

import { deleteDemoLinkPago, updateDemoLinkPago } from "@/lib/demo-admin";
import { isPortfolioDemoMode } from "@/lib/env";
import { canEdit, forbiddenResponse, requireSession, unauthorizedResponse } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

function parseId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Id invalido");
  }
  return id;
}

function normalizeRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id ?? 0),
    aseguradora: String(row.aseguradora ?? "").trim(),
    url: String(row.url ?? "").trim()
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
    const id = parseId(params.id);
    const body = (await request.json()) as Record<string, unknown>;
    const aseguradora = String(body.aseguradora ?? "").trim();
    const url = String(body.url ?? "").trim();
    if (!aseguradora) throw new Error("La aseguradora es obligatoria");
    if (!url) throw new Error("La URL es obligatoria");

    if (isPortfolioDemoMode()) {
      const link = updateDemoLinkPago(id, { aseguradora, url });
      if (!link) return NextResponse.json({ detail: "Link no encontrado" }, { status: 404 });
      return NextResponse.json({ ok: true, link });
    }

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("links_pago")
      .update({ aseguradora, url })
      .eq("id", id)
      .select("*")
      .limit(1);
    if (error) return NextResponse.json({ detail: error.message }, { status: 500 });
    if (!(data ?? []).length) return NextResponse.json({ detail: "Link no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, link: normalizeRow(data![0] as Record<string, unknown>) });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No fue posible actualizar el link";
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
    parseId(params.id);
  } catch {
    return NextResponse.json({ detail: "Id invalido" }, { status: 400 });
  }

  if (isPortfolioDemoMode()) {
    const deleted = deleteDemoLinkPago(Number(params.id));
    if (!deleted) return NextResponse.json({ detail: "Link no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.from("links_pago").delete().eq("id", Number(params.id));
  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
