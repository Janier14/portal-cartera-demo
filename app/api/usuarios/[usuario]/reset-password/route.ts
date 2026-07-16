import { NextResponse } from "next/server";

import { buildAuditActor, recordAuditEvent } from "@/lib/audit";
import { hashPassword, requireAdminSession, unauthorizedResponse } from "@/lib/auth";
import { resetDemoUserPassword } from "@/lib/demo-admin";
import { isPortfolioDemoMode } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: { usuario: string } }) {
  let adminData: Awaited<ReturnType<typeof requireAdminSession>>;
  try {
    adminData = await requireAdminSession();
  } catch {
    return unauthorizedResponse("Acceso solo para administradores");
  }

  const body = (await request.json()) as Record<string, unknown>;
  const password = String(body.password ?? "");
  if (!password) {
    return NextResponse.json({ detail: "La contrase\u00f1a es obligatoria" }, { status: 400 });
  }

  if (isPortfolioDemoMode()) {
    const ok = resetDemoUserPassword(params.usuario);
    if (!ok) return NextResponse.json({ detail: "Usuario no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.from("usuarios").update({ password_hash: await hashPassword(password) }).eq("usuario", params.usuario);
  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }

  await recordAuditEvent({
    actor: buildAuditActor(adminData),
    action: "reset_password",
    entityType: "usuario",
    entityId: params.usuario,
    module: "usuarios",
    source: "web",
    summary: `Reinicio la contrasena del usuario ${params.usuario}`,
    metadata: { password_rotated: true },
    request
  });

  return NextResponse.json({ ok: true });
}
