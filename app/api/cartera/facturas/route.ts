import { NextResponse } from "next/server";

import { canRequestApproval, createApprovalRequest } from "@/lib/approvals";
import { buildAuditActor, recordAuditEvent } from "@/lib/audit";
import {
  normalizeFacturaInput,
  normalizeFacturaRow
} from "@/lib/cartera-facturas";
import { createDemoFactura, deleteDemoFactura, listDemoFacturas, updateDemoFactura } from "@/lib/demo-cartera";
import { isPortfolioDemoMode } from "@/lib/env";
import { forbiddenResponse, hasActionPermission, requireSession, unauthorizedResponse } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

async function requireCarteraEditor() {
  const sessionData = await requireSession();
  if (!hasActionPermission(sessionData.session, "cartera", "view")) {
    throw new Error("FORBIDDEN");
  }
  return sessionData;
}

function normalizeDbError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const FACTURA_SELECT_COLUMNS = [
  "empresa",
  "numero_factura",
  "fecha_elaboracion",
  "nombre_tercero",
  "detalle",
  "debito",
  "estado",
  "tipo",
  "fecha_pago",
  "valor_pagado",
  "codigo_contable",
  "mes",
  "anio",
  "identificacion"
].join(",");

export async function GET(request: Request) {
  try {
    await requireCarteraEditor();
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return forbiddenResponse();
    }
    return unauthorizedResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const empresa = String(searchParams.get("empresa") ?? "all").trim().toUpperCase();
    const estado = String(searchParams.get("estado") ?? "PENDIENTE").trim().toUpperCase();
    const q = String(searchParams.get("q") ?? "").trim();
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const limit = Math.min(5000, Math.max(1, Number(searchParams.get("limit") ?? "50") || 50));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    if (isPortfolioDemoMode()) {
      const result = listDemoFacturas({ empresa, estado, q, page, limit });
      return NextResponse.json(result);
    }

    const supabase = createServerSupabase();
    let query = supabase
      .from("recaudos")
      .select(FACTURA_SELECT_COLUMNS, { count: "exact" })
      .order("fecha_elaboracion", { ascending: false })
      .order("numero_factura", { ascending: false })
      .range(from, to);

    if (empresa !== "ALL") {
      query = query.eq("empresa", empresa);
    }
    if (estado !== "ALL") {
      query = query.eq("estado", estado);
    }
    if (q) {
      query = query.ilike("numero_factura", `%${q}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    return NextResponse.json({
      facturas: (data ?? []).map((row) => normalizeFacturaRow(row as unknown as Record<string, unknown>)),
      total: Number(count ?? 0),
      page,
      limit
    });
  } catch (error) {
    return NextResponse.json(
      { detail: normalizeDbError(error, "No fue posible consultar las facturas") },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  let sessionData: Awaited<ReturnType<typeof requireCarteraEditor>>;
  try {
    sessionData = await requireCarteraEditor();
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return forbiddenResponse();
    }
    return unauthorizedResponse();
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { payload } = normalizeFacturaInput(body);

    if (isPortfolioDemoMode()) {
      const created = createDemoFactura(payload);
      if (!created) {
        return NextResponse.json(
          {
            detail: `Ya existe la factura ${payload.numero_factura} para empresa ${payload.empresa}.`,
            can_update: true,
            factura: normalizeFacturaRow(payload as unknown as Record<string, unknown>)
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ ok: true, factura: normalizeFacturaRow(created as unknown as Record<string, unknown>) });
    }

    const supabase = createServerSupabase();

    const { data: existing, error: lookupError } = await supabase
      .from("recaudos")
      .select("*")
      .eq("empresa", payload.empresa)
      .eq("numero_factura", payload.numero_factura)
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      return NextResponse.json({ detail: lookupError.message }, { status: 500 });
    }

    if (existing) {
      return NextResponse.json(
        {
          detail: `Ya existe la factura ${payload.numero_factura} para empresa ${payload.empresa}.`,
          can_update: true,
          factura: normalizeFacturaRow(existing as Record<string, unknown>)
        },
        { status: 409 }
      );
    }

    if (!hasActionPermission(sessionData.session, "cartera", "create")) {
      if (!canRequestApproval(sessionData.session, "cartera")) {
        return forbiddenResponse();
      }

      const approval = await createApprovalRequest({
        actor: {
          usuario: sessionData.user.usuario,
          nombre_completo: sessionData.user.nombre_completo,
          rol: sessionData.user.rol
        },
        module: "cartera",
        entityType: "factura",
        entityId: `${payload.empresa}:${payload.numero_factura}`,
        action: "create",
        summary: `Solicita crear la factura ${payload.numero_factura} de ${payload.empresa}`,
        after: payload
      });

      if (!approval.ok) {
        return NextResponse.json({ detail: approval.detail ?? "No fue posible registrar la solicitud." }, { status: 500 });
      }

      await recordAuditEvent({
        actor: buildAuditActor(sessionData),
        action: "request_approval",
        entityType: "approval_request",
        entityId: approval.id ?? null,
        module: "cartera",
        source: "web",
        summary: `Solicito aprobacion para crear la factura ${payload.numero_factura} de ${payload.empresa}`,
        after: payload,
        request
      });

      return NextResponse.json(
        { ok: true, pending_approval: true, detail: "La solicitud quedo enviada para aprobacion del administrador." },
        { status: 202 }
      );
    }

    const { data, error } = await supabase.from("recaudos").insert(payload).select("*").limit(1);
    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    const factura = normalizeFacturaRow((data ?? [])[0] as Record<string, unknown>);
    await recordAuditEvent({
      actor: buildAuditActor(sessionData),
      action: "create",
      entityType: "factura",
      entityId: `${payload.empresa}:${payload.numero_factura}`,
      module: "cartera",
      source: "web",
      summary: `Creo la factura ${payload.numero_factura} de ${payload.empresa}`,
      after: factura,
      request
    });

    return NextResponse.json({ ok: true, factura });
  } catch (error) {
    return NextResponse.json(
      { detail: normalizeDbError(error, "No fue posible crear la factura") },
      { status: 400 }
    );
  }
}

export async function PUT(request: Request) {
  let sessionData: Awaited<ReturnType<typeof requireCarteraEditor>>;
  try {
    sessionData = await requireCarteraEditor();
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return forbiddenResponse();
    }
    return unauthorizedResponse();
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { payload, numero_factura_original, empresa_original } = normalizeFacturaInput(body);

    if (isPortfolioDemoMode()) {
      const result = updateDemoFactura(payload, {
        empresa: empresa_original,
        numero_factura: numero_factura_original
      });
      if (result.type === "missing") {
        return NextResponse.json({ detail: "La factura a actualizar no existe" }, { status: 404 });
      }
      if (result.type === "duplicate") {
        return NextResponse.json(
          { detail: `Ya existe la factura ${payload.numero_factura} para empresa ${payload.empresa}.` },
          { status: 409 }
        );
      }
      return NextResponse.json({ ok: true, factura: normalizeFacturaRow(result.factura as unknown as Record<string, unknown>) });
    }

    const supabase = createServerSupabase();

    const { data: existing, error: existingError } = await supabase
      .from("recaudos")
      .select("*")
      .eq("empresa", empresa_original)
      .eq("numero_factura", numero_factura_original)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ detail: existingError.message }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ detail: "La factura a actualizar no existe" }, { status: 404 });
    }

    if (numero_factura_original !== payload.numero_factura || empresa_original !== payload.empresa) {
      const { data: duplicate, error: duplicateError } = await supabase
        .from("recaudos")
        .select("*")
        .eq("empresa", payload.empresa)
        .eq("numero_factura", payload.numero_factura)
        .limit(1)
        .maybeSingle();

      if (duplicateError) {
        return NextResponse.json({ detail: duplicateError.message }, { status: 500 });
      }

      if (duplicate) {
        return NextResponse.json(
          { detail: `Ya existe la factura ${payload.numero_factura} para empresa ${payload.empresa}.` },
          { status: 409 }
        );
      }
    }

    if (!hasActionPermission(sessionData.session, "cartera", "update")) {
      if (!canRequestApproval(sessionData.session, "cartera")) {
        return forbiddenResponse();
      }

      const approval = await createApprovalRequest({
        actor: {
          usuario: sessionData.user.usuario,
          nombre_completo: sessionData.user.nombre_completo,
          rol: sessionData.user.rol
        },
        module: "cartera",
        entityType: "factura",
        entityId: `${payload.empresa}:${payload.numero_factura}`,
        action: "update",
        summary: `Solicita actualizar la factura ${payload.numero_factura} de ${payload.empresa}`,
        before: normalizeFacturaRow(existing as Record<string, unknown>),
        after: payload,
        metadata: { clave_original: `${empresa_original}:${numero_factura_original}` }
      });

      if (!approval.ok) {
        return NextResponse.json({ detail: approval.detail ?? "No fue posible registrar la solicitud." }, { status: 500 });
      }

      await recordAuditEvent({
        actor: buildAuditActor(sessionData),
        action: "request_approval",
        entityType: "approval_request",
        entityId: approval.id ?? null,
        module: "cartera",
        source: "web",
        summary: `Solicito aprobacion para actualizar la factura ${payload.numero_factura} de ${payload.empresa}`,
        before: normalizeFacturaRow(existing as Record<string, unknown>),
        after: payload,
        request
      });

      return NextResponse.json(
        { ok: true, pending_approval: true, detail: "La actualizacion quedo pendiente por aprobacion." },
        { status: 202 }
      );
    }

    const { data, error } = await supabase
      .from("recaudos")
      .update(payload)
      .eq("empresa", empresa_original)
      .eq("numero_factura", numero_factura_original)
      .select("*")
      .limit(1);

    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    const factura = normalizeFacturaRow((data ?? [])[0] as Record<string, unknown>);
    await recordAuditEvent({
      actor: buildAuditActor(sessionData),
      action: "update",
      entityType: "factura",
      entityId: `${payload.empresa}:${payload.numero_factura}`,
      module: "cartera",
      source: "web",
      summary: `Actualizo la factura ${payload.numero_factura} de ${payload.empresa}`,
      before: normalizeFacturaRow(existing as Record<string, unknown>),
      after: factura,
      metadata: { clave_original: `${empresa_original}:${numero_factura_original}` },
      request
    });

    return NextResponse.json({ ok: true, factura });
  } catch (error) {
    return NextResponse.json(
      { detail: normalizeDbError(error, "No fue posible actualizar la factura") },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  let sessionData: Awaited<ReturnType<typeof requireCarteraEditor>>;
  try {
    sessionData = await requireCarteraEditor();
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return forbiddenResponse();
    }
    return unauthorizedResponse();
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const numero_factura = String(body.numero_factura ?? "").trim();
    const empresa = String(body.empresa ?? "").trim().toUpperCase();

    if (!numero_factura || !empresa) {
      return NextResponse.json({ detail: "numero_factura y empresa son obligatorios" }, { status: 400 });
    }

    if (isPortfolioDemoMode()) {
      const deleted = deleteDemoFactura({ empresa, numero_factura });
      if (!deleted) {
        return NextResponse.json({ detail: "La factura no existe" }, { status: 404 });
      }
      return NextResponse.json({
        ok: true,
        factura: {
          empresa,
          numero_factura
        }
      });
    }

    const supabase = createServerSupabase();
    const { data: existing, error: lookupError } = await supabase
      .from("recaudos")
      .select("*")
      .eq("empresa", empresa)
      .eq("numero_factura", numero_factura)
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      return NextResponse.json({ detail: lookupError.message }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ detail: "La factura no existe" }, { status: 404 });
    }

    if (!hasActionPermission(sessionData.session, "cartera", "delete")) {
      if (!canRequestApproval(sessionData.session, "cartera")) {
        return forbiddenResponse();
      }

      const approval = await createApprovalRequest({
        actor: {
          usuario: sessionData.user.usuario,
          nombre_completo: sessionData.user.nombre_completo,
          rol: sessionData.user.rol
        },
        module: "cartera",
        entityType: "factura",
        entityId: `${empresa}:${numero_factura}`,
        action: "delete",
        summary: `Solicita eliminar la factura ${numero_factura} de ${empresa}`,
        before: normalizeFacturaRow(existing as Record<string, unknown>)
      });

      if (!approval.ok) {
        return NextResponse.json({ detail: approval.detail ?? "No fue posible registrar la solicitud." }, { status: 500 });
      }

      await recordAuditEvent({
        actor: buildAuditActor(sessionData),
        action: "request_approval",
        entityType: "approval_request",
        entityId: approval.id ?? null,
        module: "cartera",
        source: "web",
        summary: `Solicito aprobacion para eliminar la factura ${numero_factura} de ${empresa}`,
        before: normalizeFacturaRow(existing as Record<string, unknown>),
        request
      });

      return NextResponse.json(
        { ok: true, pending_approval: true, detail: "La eliminacion quedo pendiente por aprobacion." },
        { status: 202 }
      );
    }

    const { error } = await supabase
      .from("recaudos")
      .delete()
      .eq("empresa", empresa)
      .eq("numero_factura", numero_factura);

    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    await recordAuditEvent({
      actor: buildAuditActor(sessionData),
      action: "delete",
      entityType: "factura",
      entityId: `${empresa}:${numero_factura}`,
      module: "cartera",
      source: "web",
      summary: `Elimino la factura ${numero_factura} de ${empresa}`,
      before: normalizeFacturaRow(existing as Record<string, unknown>),
      request
    });

    return NextResponse.json({
      ok: true,
      factura: {
        empresa,
        numero_factura
      }
    });
  } catch (error) {
    return NextResponse.json(
      { detail: normalizeDbError(error, "No fue posible eliminar la factura") },
      { status: 400 }
    );
  }
}
