import { NextResponse } from "next/server";

import { deleteDemoEmpresaContacto, updateDemoEmpresaContacto } from "@/lib/demo-admin";
import { isPortfolioDemoMode } from "@/lib/env";
import { canEdit, forbiddenResponse, requireSession, unauthorizedResponse } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

const EMPRESAS = ["SYSO", "SANUM"] as const;

type EmpresaCode = (typeof EMPRESAS)[number];

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function parseEmpresa(value: unknown): EmpresaCode {
  const empresa = cleanString(value).toUpperCase();
  if (!EMPRESAS.includes(empresa as EmpresaCode)) {
    throw new Error("La empresa debe ser SYSO o SANUM");
  }
  return empresa as EmpresaCode;
}

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
    empresa: parseEmpresa(row.empresa),
    nit: cleanString(row.nit),
    razon_social: cleanString(row.razon_social),
    nombre_contacto: cleanString(row.nombre_contacto),
    cargo: cleanString(row.cargo),
    telefono: cleanString(row.telefono),
    email: cleanString(row.email),
    observaciones: cleanString(row.observaciones),
    created_at: cleanString(row.created_at)
  };
}

function buildPayload(body: Record<string, unknown>) {
  const razonSocial = cleanString(body.razon_social);
  if (!razonSocial) {
    throw new Error("La raz\u00f3n social es obligatoria");
  }

  return {
    empresa: parseEmpresa(body.empresa),
    nit: cleanString(body.nit),
    razon_social: razonSocial,
    nombre_contacto: cleanString(body.nombre_contacto),
    cargo: cleanString(body.cargo),
    telefono: cleanString(body.telefono),
    email: cleanString(body.email),
    observaciones: cleanString(body.observaciones)
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
    const body = (await request.json()) as Record<string, unknown>;
    const payload = buildPayload(body);

    if (isPortfolioDemoMode()) {
      const contacto = updateDemoEmpresaContacto(parseId(params.id), payload);
      if (!contacto) {
        return NextResponse.json({ detail: "Empresa cliente no encontrada" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, contacto });
    }

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("contactos_empresa")
      .update(payload)
      .eq("id", parseId(params.id))
      .select("*")
      .limit(1);

    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }
    if (!(data ?? []).length) {
      return NextResponse.json({ detail: "Empresa cliente no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, contacto: normalizeRow(data[0] as Record<string, unknown>) });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No fue posible actualizar la empresa cliente";
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
    if (isPortfolioDemoMode()) {
      const deleted = deleteDemoEmpresaContacto(parseId(params.id));
      if (!deleted) {
        return NextResponse.json({ detail: "Empresa cliente no encontrada" }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }

    const supabase = createServerSupabase();
    const { error } = await supabase.from("contactos_empresa").delete().eq("id", parseId(params.id));
    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No fue posible eliminar la empresa cliente";
    return NextResponse.json({ detail }, { status: 400 });
  }
}
