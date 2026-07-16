import { NextResponse } from "next/server";

import { buildAuditActor, recordAuditEvent } from "@/lib/audit";
import type { AppRole } from "@/lib/auth";
import {
  buildDefaultActionPermissions,
  normalizeActionPermissions,
  requireAdminSession,
  unauthorizedResponse
} from "@/lib/auth";
import { deactivateDemoUser, listDemoUsers, updateDemoUser } from "@/lib/demo-admin";
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
    activo: Boolean(row.activo ?? true)
  };
}

function normalizeModules(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && VALID_MODULES.includes(item));
}

export async function PUT(request: Request, { params }: { params: { usuario: string } }) {
  let adminUser: Awaited<ReturnType<typeof requireAdminSession>>;
  try {
    adminUser = await requireAdminSession();
  } catch {
    return unauthorizedResponse("Acceso solo para administradores");
  }

  const body = (await request.json()) as Record<string, unknown>;
  const nuevoUsuario = String(body.usuario ?? "").trim();
  const nombre_completo = String(body.nombre_completo ?? "").trim();
  const modulos = normalizeModules(body.modulos);
  const permisos_edicion = normalizeModules(body.permisos_edicion).filter((m) => modulos.includes(m));
  const rol: AppRole = VALID_ROLES.has(body.rol as string) ? (body.rol as AppRole) : "operativo";
  const action_permissions = normalizeActionPermissions(body.action_permissions, rol, modulos, permisos_edicion);
  const activo = Boolean(body.activo ?? true);

  if (!nuevoUsuario || !nombre_completo) {
    return NextResponse.json({ detail: "Usuario y nombre son obligatorios" }, { status: 400 });
  }
  if (!modulos.length) {
    return NextResponse.json({ detail: "Debes asignar al menos un modulo" }, { status: 400 });
  }
  if (params.usuario === adminUser.user.usuario && !activo) {
    return NextResponse.json({ detail: "El admin no puede desactivarse a si mismo" }, { status: 400 });
  }

  if (isPortfolioDemoMode()) {
    const result = updateDemoUser(params.usuario, {
      usuario: nuevoUsuario,
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
    if (result.type === "missing") return NextResponse.json({ detail: "Usuario no encontrado" }, { status: 404 });
    if (result.type === "duplicate") return NextResponse.json({ detail: "El usuario ya existe" }, { status: 409 });
    return NextResponse.json({ ok: true, usuario: result.usuario });
  }

  const supabase = createServerSupabase();
  const { data: beforeUser, error: beforeError } = await supabase
    .from("usuarios")
    .select("usuario,nombre_completo,rol,modulos,permisos_edicion,action_permissions,activo")
    .eq("usuario", params.usuario)
    .limit(1)
    .maybeSingle();

  if (beforeError) return NextResponse.json({ detail: beforeError.message }, { status: 500 });
  if (!beforeUser) return NextResponse.json({ detail: "Usuario no encontrado" }, { status: 404 });

  if (rol !== "admin" && beforeUser.rol === "admin") {
    const { count } = await supabase
      .from("usuarios")
      .select("*", { count: "exact", head: true })
      .eq("rol", "admin")
      .eq("activo", true);
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ detail: "No puedes degradar al \u00fanico admin del sistema" }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("usuarios")
    .update({
      usuario: nuevoUsuario,
      nombre_completo,
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
    })
    .eq("usuario", params.usuario)
    .select("usuario,nombre_completo,rol,modulos,permisos_edicion,action_permissions,activo")
    .limit(1);

  if (error) return NextResponse.json({ detail: error.message }, { status: 500 });
  if (!(data ?? []).length) return NextResponse.json({ detail: "Usuario no encontrado" }, { status: 404 });

  const updatedUser = sanitizeUser(data![0] as Record<string, unknown>);
  await recordAuditEvent({
    actor: buildAuditActor(adminUser),
    action: "update",
    entityType: "usuario",
    entityId: updatedUser.usuario,
    module: "usuarios",
    source: "web",
    summary:
      params.usuario === updatedUser.usuario
        ? `Actualizo el usuario ${updatedUser.usuario}`
        : `Renombro el usuario ${params.usuario} a ${updatedUser.usuario}`,
    before: sanitizeUser(beforeUser as Record<string, unknown>),
    after: updatedUser,
    metadata: { usuario_anterior: params.usuario },
    request
  });

  return NextResponse.json({ ok: true, usuario: updatedUser });
}

export async function DELETE(request: Request, { params }: { params: { usuario: string } }) {
  let adminUser: Awaited<ReturnType<typeof requireAdminSession>>;
  try {
    adminUser = await requireAdminSession();
  } catch {
    return unauthorizedResponse("Acceso solo para administradores");
  }
  if (params.usuario === adminUser.user.usuario) {
    return NextResponse.json({ detail: "No puedes desactivar tu propia cuenta" }, { status: 400 });
  }

  if (isPortfolioDemoMode()) {
    const existing = listDemoUsers().find((item) => item.usuario === params.usuario);
    if (!existing) return NextResponse.json({ detail: "Usuario no encontrado" }, { status: 404 });
    deactivateDemoUser(params.usuario);
    return NextResponse.json({ ok: true });
  }

  const supabase = createServerSupabase();
  const { data: target, error: targetError } = await supabase
    .from("usuarios")
    .select("usuario,nombre_completo,rol,modulos,permisos_edicion,action_permissions,activo")
    .eq("usuario", params.usuario)
    .limit(1)
    .maybeSingle();

  if (targetError) return NextResponse.json({ detail: targetError.message }, { status: 500 });
  if (!target) return NextResponse.json({ detail: "Usuario no encontrado" }, { status: 404 });

  if (target.rol === "admin") {
    const { count } = await supabase
      .from("usuarios")
      .select("*", { count: "exact", head: true })
      .eq("rol", "admin")
      .eq("activo", true);
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ detail: "No puedes desactivar al \u00fanico admin del sistema" }, { status: 400 });
    }
  }

  const { error } = await supabase.from("usuarios").update({ activo: false }).eq("usuario", params.usuario);
  if (error) return NextResponse.json({ detail: error.message }, { status: 500 });

  await recordAuditEvent({
    actor: buildAuditActor(adminUser),
    action: "deactivate",
    entityType: "usuario",
    entityId: params.usuario,
    module: "usuarios",
    source: "web",
    summary: `Desactivo el usuario ${params.usuario}`,
    before: sanitizeUser(target as Record<string, unknown>),
    after: { ...sanitizeUser(target as Record<string, unknown>), activo: false },
    request
  });

  return NextResponse.json({ ok: true });
}
