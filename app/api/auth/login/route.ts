import { NextResponse } from "next/server";

import { openAuditSession, recordAuditEvent } from "@/lib/audit";
import { buildAuthCookie, findUser, resolveLoginRole, signSessionToken, verifyPassword } from "@/lib/auth";

type LoginBody = {
  usuario?: string;
  password?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as LoginBody;
  const usuario = body.usuario?.trim() ?? "";
  const password = body.password ?? "";

  if (!usuario || !password) {
    await recordAuditEvent({
      action: "login_failed",
      entityType: "auth_session",
      entityId: usuario || null,
      module: "auth",
      source: "web",
      status: "failure",
      summary: "Intento de login rechazado por credenciales incompletas",
      metadata: { usuario_intentado: usuario || null },
      request
    });
    return NextResponse.json({ detail: "Usuario y contrase\u00f1a son obligatorios" }, { status: 400 });
  }

  try {
    const user = await findUser(usuario);
    if (!user || !user.activo) {
      await recordAuditEvent({
        action: "login_failed",
        entityType: "auth_session",
        entityId: usuario,
        module: "auth",
        source: "web",
        status: "failure",
        summary: `Intento fallido de login para ${usuario}`,
        metadata: { usuario_intentado: usuario, motivo: "usuario_invalido_o_inactivo" },
        request
      });
      return NextResponse.json({ detail: "Usuario o contrase\u00f1a incorrectos" }, { status: 401 });
    }

    const validPassword = await verifyPassword(password, user.password_hash);
    if (!validPassword) {
      await recordAuditEvent({
        actor: { usuario: user.usuario, nombre_completo: user.nombre_completo, rol: user.rol },
        action: "login_failed",
        entityType: "auth_session",
        entityId: user.usuario,
        module: "auth",
        source: "web",
        status: "failure",
        summary: `Intento fallido de login para ${user.usuario}`,
        metadata: { usuario_intentado: user.usuario, motivo: "password_invalido" },
        request
      });
      return NextResponse.json({ detail: "Usuario o contrase\u00f1a incorrectos" }, { status: 401 });
    }

    const { token, sessionId, expiresAt } = await signSessionToken(user);
    const rol = resolveLoginRole(user);
    const response = NextResponse.json({ usuario: user.usuario, rol });

    await openAuditSession({
      sessionId,
      user,
      expiresAt,
      request,
      metadata: { modulos: user.modulos, permisos_edicion: user.permisos_edicion }
    });
    await recordAuditEvent({
      actor: { usuario: user.usuario, nombre_completo: user.nombre_completo, rol: user.rol, session_id: sessionId },
      action: "login_success",
      entityType: "auth_session",
      entityId: sessionId,
      module: "auth",
      source: "web",
      summary: `Inicio de sesion de ${user.usuario}`,
      metadata: { expires_at: expiresAt },
      request
    });

    response.cookies.set(buildAuthCookie(token));

    return response;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Error interno autenticando usuario";
    console.error("[login] ERROR:", detail);
    return NextResponse.json({ detail }, { status: 500 });
  }
}
