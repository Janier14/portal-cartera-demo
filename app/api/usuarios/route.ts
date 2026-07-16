import { NextResponse } from "next/server";

import { buildAuditActor, recordAuditEvent } from "@/lib/audit";
import type { AppRole } from "@/lib/auth";
import {
  buildDefaultActionPermissions,
  findUser,
  hashPassword,
  normalizeActionPermissions,
  requireAdminSession,
  unauthorizedResponse
} from "@/lib/auth";
import { createDemoUser, listDemoUsers } from "@/lib/demo-admin";
import { isPortfolioDemoMode } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";

const VALID_ROLES = new Set(["admin", "gerencia", "directivo", "operativo"]);
const VALID_MODULES = ["resumen", "arl", "cartera", "seguros", "directorio", "analisis-cartera"];

function sanitizeUser(row: Record<string, unknown>) {
  return {
    usuario: String(row.usuario ?? ""),
    nombre_completo: String(row.nombre_completo ?? ""),
    rol: VALID_ROLES.has(row.rol as string) ? (row.rol as string) : "operativo",
    modulos: Array.isArray(row.modulos) ? (row.modulos as string[]) : [],
    permisos_edicion: Array.isArray(row.permisos_edicion) ? (row.permisos_edicion as string[]) : [],
    action_permissions: row.action_permissions && typeof row.action_permissions === "object" ? row.action_permissions : {},
    activo: Boolean(row.activo ?? true),
    conectado_ahora: Boolean(row.conectado_ahora ?? false),
    ultimo_login_at: row.ultimo_login_at ? String(row.ultimo_login_at) : null,
    ultima_actividad_at: row.ultima_actividad_at ? String(row.ultima_actividad_at) : null,
    ultimo_logout_at: row.ultimo_logout_at ? String(row.ultimo_logout_at) : null
  };
}

function normalizeModules(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && VALID_MODULES.includes(item));
}

export async function GET() {
  try {
    await requireAdminSession();
  } catch {
    return unauthorizedResponse("Acceso solo para administradores");
  }

  if (isPortfolioDemoMode()) {
    return NextResponse.json({ usuarios: listDemoUsers() });
  }

  const supabase = createServerSupabase();
  const [{ data, error }, { data: sessions, error: sessionsError }] = await Promise.all([
    supabase
      .from("usuarios")
      .select("usuario,nombre_completo,rol,modulos,permisos_edicion,action_permissions,activo")
      .order("nombre_completo"),
    supabase
      .from("audit_user_sessions")
      .select("usuario,login_at,last_seen_at,logged_out_at,expires_at")
      .order("login_at", { ascending: false })
      .limit(500)
  ]);
  if (error || sessionsError) {
    return NextResponse.json({ detail: error?.message ?? sessionsError?.message }, { status: 500 });
  }

  const now = Date.now();
  const latestSessionByUser = new Map<string, Record<string, unknown>>();
  for (const row of sessions ?? []) {
    const sessionRow = row as Record<string, unknown>;
    const usuario = String(sessionRow.usuario ?? "");
    if (usuario && !latestSessionByUser.has(usuario)) {
      latestSessionByUser.set(usuario, sessionRow);
    }
  }

  return NextResponse.json({
    usuarios: (data ?? []).map((row) => {
      const userRow = row as Record<string, unknown>;
      const sessionRow = latestSessionByUser.get(String(userRow.usuario ?? ""));
      const expiresAt = sessionRow?.expires_at ? Date.parse(String(sessionRow.expires_at)) : null;
      const loggedOutAt = sessionRow?.logged_out_at ? String(sessionRow.logged_out_at) : null;
      const connectedNow = Boolean(sessionRow) && !loggedOutAt && (expiresAt === null || expiresAt > now);

      return sanitizeUser({
        ...userRow,
        conectado_ahora: connectedNow,
        ultimo_login_at: sessionRow?.login_at ?? null,
        ultima_actividad_at: sessionRow?.last_seen_at ?? null,
        ultimo_logout_at: loggedOutAt
      });
    })
  });
}

export async function POST(request: Request) {
  let adminData: Awaited<ReturnType<typeof requireAdminSession>>;
  try {
    adminData = await requireAdminSession();
  } catch {
    return unauthorizedResponse("Acceso solo para administradores");
  }

  const body = (await request.json()) as Record<string, unknown>;
  const usuario = String(body.usuario ?? "").trim();
  const nombre_completo = String(body.nombre_completo ?? "").trim();
  const password = String(body.password ?? "");
  const modulos = normalizeModules(body.modulos);
  const permisos_edicion = normalizeModules(body.permisos_edicion).filter((m) => modulos.includes(m));
  const rol: AppRole = VALID_ROLES.has(body.rol as string) ? (body.rol as AppRole) : "operativo";
  const action_permissions = normalizeActionPermissions(body.action_permissions, rol, modulos, permisos_edicion);
  const activo = Boolean(body.activo ?? true);

  if (!usuario || !nombre_completo || !password) {
    return NextResponse.json({ detail: "Usuario, nombre y contrase\u00f1a son obligatorios" }, { status: 400 });
  }
  if (!modulos.length) {
    return NextResponse.json({ detail: "Debes asignar al menos un modulo" }, { status: 400 });
  }
  if (rol === "admin" && adminData.user.rol !== "admin") {
    return NextResponse.json({ detail: "Solo un admin puede crear otro admin" }, { status: 403 });
  }

  if (isPortfolioDemoMode()) {
    const createdUser = createDemoUser({
      usuario,
      nombre_completo,
      rol,
      modulos,
      permisos_edicion: rol === "admin" ? [...modulos] : permisos_edicion,
      action_permissions: rol === "admin" ? buildDefaultActionPermissions("admin", modulos, modulos) : action_permissions,
      activo,
      conectado_ahora: false,
      ultimo_login_at: null,
      ultima_actividad_at: null,
      ultimo_logout_at: null
    });
    if (!createdUser) {
      return NextResponse.json({ detail: "El usuario ya existe" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, usuario: createdUser });
  }

  if (await findUser(usuario)) {
    return NextResponse.json({ detail: "El usuario ya existe" }, { status: 409 });
  }

  const supabase = createServerSupabase();
  const payload = {
    usuario,
    nombre_completo,
    password_hash: await hashPassword(password),
    rol,
    modulos,
    permisos_edicion: rol === "admin"
      ? [...modulos]
      : modulos.filter((modulo) => {
          const actions = action_permissions[modulo as keyof typeof action_permissions] ?? [];
          return actions.includes("create") || actions.includes("update") || actions.includes("delete");
        }),
    action_permissions: rol === "admin" ? buildDefaultActionPermissions("admin", modulos, modulos) : action_permissions,
    activo
  };
  const { data, error } = await supabase
    .from("usuarios")
    .insert(payload)
    .select("usuario,nombre_completo,rol,modulos,permisos_edicion,action_permissions,activo")
    .limit(1);
  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }

  const createdUser = sanitizeUser((data ?? [])[0] as Record<string, unknown>);
  await recordAuditEvent({
    actor: buildAuditActor(adminData),
    action: "create",
    entityType: "usuario",
    entityId: createdUser.usuario,
    module: "usuarios",
    source: "web",
    summary: `Creo el usuario ${createdUser.usuario}`,
    after: createdUser,
    request
  });

  return NextResponse.json({ ok: true, usuario: createdUser });
}
