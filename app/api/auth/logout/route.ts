import { NextResponse } from "next/server";

import { closeAuditSession, recordAuditEvent } from "@/lib/audit";
import { clearAuthCookie, getSessionFromCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const sessionData = await getSessionFromCookie();
  if (sessionData) {
    await closeAuditSession(sessionData.session.sid, request);
    await recordAuditEvent({
      actor: {
        usuario: sessionData.user.usuario,
        nombre_completo: sessionData.user.nombre_completo,
        rol: sessionData.user.rol,
        session_id: sessionData.session.sid
      },
      action: "logout",
      entityType: "auth_session",
      entityId: sessionData.session.sid,
      module: "auth",
      source: "web",
      summary: `Cierre de sesion de ${sessionData.user.usuario}`,
      request
    });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(clearAuthCookie());
  response.cookies.set({ name: "cmym_rol", value: "", path: "/", maxAge: 0 });
  response.cookies.set({ name: "cmym_modulos", value: "", path: "/", maxAge: 0 });
  return response;
}
