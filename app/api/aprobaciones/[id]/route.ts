import { NextResponse } from "next/server";

import type { ApprovalRequestRow } from "@/lib/approvals";
import { buildAuditActor, recordAuditEvent } from "@/lib/audit";
import { normalizeFacturaRow } from "@/lib/cartera-facturas";
import { reviewDemoApprovalRequest } from "@/lib/demo-admin";
import { isPortfolioDemoMode } from "@/lib/env";
import { forbiddenResponse, hasActionPermission, requireSession, unauthorizedResponse } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

async function applyFacturaApproval(request: ApprovalRequestRow) {
  const supabase = createServerSupabase();
  const before = request.before_data ?? null;
  const after = request.after_data ?? null;

  if (request.action === "create") {
    if (!after) {
      return { ok: false, detail: "La solicitud no contiene datos de la factura a crear." };
    }

    const { data: existing } = await supabase
      .from("recaudos")
      .select("*")
      .eq("empresa", String(after.empresa ?? ""))
      .eq("numero_factura", String(after.numero_factura ?? ""))
      .limit(1)
      .maybeSingle();

    if (existing) {
      return { ok: false, detail: "La factura ya existe y no se puede aprobar dos veces." };
    }

    const { error } = await supabase.from("recaudos").insert(after);
    return error ? { ok: false, detail: error.message } : { ok: true };
  }

  if (request.action === "update") {
    if (!before || !after) {
      return { ok: false, detail: "La solicitud no contiene el antes y despues requeridos." };
    }

    if (String(before.empresa ?? "") !== String(after.empresa ?? "") || String(before.numero_factura ?? "") !== String(after.numero_factura ?? "")) {
      const { data: duplicate } = await supabase
        .from("recaudos")
        .select("*")
        .eq("empresa", String(after.empresa ?? ""))
        .eq("numero_factura", String(after.numero_factura ?? ""))
        .limit(1)
        .maybeSingle();

      if (duplicate) {
        return { ok: false, detail: "Ya existe una factura con la clave destino solicitada." };
      }
    }

    const { error } = await supabase
      .from("recaudos")
      .update(after)
      .eq("empresa", String(before.empresa ?? ""))
      .eq("numero_factura", String(before.numero_factura ?? ""));

    return error ? { ok: false, detail: error.message } : { ok: true };
  }

  if (request.action === "delete") {
    const source = before ?? after;
    if (!source) {
      return { ok: false, detail: "La solicitud no contiene la clave de la factura a eliminar." };
    }

    const { error } = await supabase
      .from("recaudos")
      .delete()
      .eq("empresa", String(source.empresa ?? ""))
      .eq("numero_factura", String(source.numero_factura ?? ""));

    return error ? { ok: false, detail: error.message } : { ok: true };
  }

  return { ok: false, detail: "La accion solicitada no tiene ejecutor." };
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  let adminData: Awaited<ReturnType<typeof requireSession>>;
  try {
    adminData = await requireSession();
  } catch {
    return unauthorizedResponse();
  }

  if (adminData.user.rol !== "admin" && !hasActionPermission(adminData.session, "usuarios", "approve")) {
    return forbiddenResponse("Acceso solo para revisores autorizados");
  }

  const body = (await request.json()) as Record<string, unknown>;
  const decision = String(body.decision ?? "").trim().toLowerCase();
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json({ detail: "La decision debe ser approve o reject." }, { status: 400 });
  }

  if (isPortfolioDemoMode()) {
    const result = reviewDemoApprovalRequest(params.id, decision as "approve" | "reject", adminData.user.usuario);
    if (result.type === "missing") return NextResponse.json({ detail: "Solicitud no encontrada." }, { status: 404 });
    if (result.type === "conflict") return NextResponse.json({ detail: "La solicitud ya fue revisada." }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("approval_requests")
    .select("*")
    .eq("id", params.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ detail: "Solicitud no encontrada." }, { status: 404 });
  }

  const approval = data as ApprovalRequestRow;
  if (approval.status !== "pending") {
    return NextResponse.json({ detail: "La solicitud ya fue revisada." }, { status: 409 });
  }

  if (decision === "approve") {
    if (approval.module === "cartera" && approval.entity_type === "factura") {
      const applied = await applyFacturaApproval(approval);
      if (!applied.ok) {
        return NextResponse.json({ detail: applied.detail ?? "No fue posible aplicar la aprobacion." }, { status: 500 });
      }
    } else {
      return NextResponse.json({ detail: "No existe ejecutor para esta solicitud." }, { status: 400 });
    }
  }

  const reviewedPayload = {
    status: decision === "approve" ? "approved" : "rejected",
    reviewed_at: new Date().toISOString(),
    reviewed_by_usuario: adminData.user.usuario,
    reviewed_by_nombre: adminData.user.nombre_completo,
    reviewed_by_rol: adminData.user.rol
  };

  const { error: updateError } = await supabase
    .from("approval_requests")
    .update(reviewedPayload)
    .eq("id", params.id);

  if (updateError) {
    return NextResponse.json({ detail: updateError.message }, { status: 500 });
  }

  await recordAuditEvent({
    actor: buildAuditActor(adminData),
    action: decision === "approve" ? "approve" : "reject",
    entityType: "approval_request",
    entityId: approval.id,
    module: "usuarios",
    summary:
      decision === "approve"
        ? `Aprobo solicitud ${approval.action} sobre ${approval.entity_type} ${approval.entity_id}`
        : `Rechazo solicitud ${approval.action} sobre ${approval.entity_type} ${approval.entity_id}`,
    before: approval,
    after: {
      ...approval,
      ...reviewedPayload,
      before_data: approval.before_data ? normalizeFacturaRow(approval.before_data) : null,
      after_data: approval.after_data ? normalizeFacturaRow(approval.after_data) : null
    },
    request
  });

  return NextResponse.json({ ok: true });
}
