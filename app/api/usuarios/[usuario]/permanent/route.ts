import { NextResponse } from "next/server";

import { buildAuditActor, recordAuditEvent } from "@/lib/audit";
import { requireAdminSession, unauthorizedResponse } from "@/lib/auth";
import { listDemoUsers, permanentlyDeleteDemoUser } from "@/lib/demo-admin";
import { isPortfolioDemoMode } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";

export async function DELETE(request: Request, { params }: { params: { usuario: string } }) {
  let adminUser: Awaited<ReturnType<typeof requireAdminSession>>;
  try {
    adminUser = await requireAdminSession();
  } catch {
    return unauthorizedResponse("Acceso solo para administradores");
  }

  if (params.usuario === adminUser.user.usuario) {
    return NextResponse.json({ detail: "No puedes eliminar tu propia cuenta" }, { status: 400 });
  }

  if (isPortfolioDemoMode()) {
    const existing = listDemoUsers().find((item) => item.usuario === params.usuario);
    if (!existing) return NextResponse.json({ detail: "Usuario no encontrado" }, { status: 404 });
    if (existing.activo) return NextResponse.json({ detail: "Solo se pueden eliminar usuarios desactivados" }, { status: 400 });
    permanentlyDeleteDemoUser(params.usuario);
    return NextResponse.json({ ok: true });
  }

  const supabase = createServerSupabase();

  const { data: existing, error: fetchError } = await supabase
    .from("usuarios")
    .select("usuario,nombre_completo,rol,modulos,permisos_edicion,activo")
    .eq("usuario", params.usuario)
    .limit(1)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ detail: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ detail: "Usuario no encontrado" }, { status: 404 });
  if ((existing as Record<string, unknown>).activo) {
    return NextResponse.json({ detail: "Solo se pueden eliminar usuarios desactivados" }, { status: 400 });
  }

  const { error } = await supabase.from("usuarios").delete().eq("usuario", params.usuario);
  if (error) return NextResponse.json({ detail: error.message }, { status: 500 });

  await recordAuditEvent({
    actor: buildAuditActor(adminUser),
    action: "delete_permanent",
    entityType: "usuario",
    entityId: params.usuario,
    module: "usuarios",
    source: "web",
    summary: `Elimino permanentemente el usuario ${params.usuario}`,
    before: existing as Record<string, unknown>,
    request
  });

  return NextResponse.json({ ok: true });
}
