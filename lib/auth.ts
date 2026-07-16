import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getServerEnv, isPortfolioDemoMode } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";

const JWT_COOKIE = "cmym_token";
const JWT_ALG = "HS256";
const EXPIRE_HOURS = 24 * 10; // 10 dias de sesion para PWA/moviles
const VALID_MODULES = ["resumen", "arl", "cartera", "seguros", "directorio", "analisis-cartera"] as const;
const VALID_ROLES = new Set(["admin", "gerencia", "directivo", "operativo"]);
const VALID_ACTIONS = ["view", "create", "update", "delete", "export", "approve"] as const;
const DEMO_MODULES = [...VALID_MODULES];

export type AppRole = "admin" | "gerencia" | "directivo" | "operativo";
export type AppModule = (typeof VALID_MODULES)[number];
export type AppAction = (typeof VALID_ACTIONS)[number];
export type ActionPermissions = Partial<Record<AppModule, AppAction[]>>;

export type AppUser = {
  usuario: string;
  nombre_completo: string;
  password_hash: string;
  rol: AppRole;
  modulos: string[];
  permisos_edicion: string[];
  action_permissions: ActionPermissions;
  activo: boolean;
};

export type SessionPayload = {
  sub: string;
  rol: AppRole;
  modulos: string[];
  permisos_edicion: string[];
  action_permissions: ActionPermissions;
  sid: string | null;
  exp: number;
};

function getDemoUser(): AppUser {
  return {
    usuario: "demo.admin",
    nombre_completo: "Demo Portfolio",
    password_hash: "",
    rol: "admin",
    modulos: [...DEMO_MODULES],
    permisos_edicion: [...DEMO_MODULES],
    action_permissions: buildDefaultActionPermissions("admin", [...DEMO_MODULES], [...DEMO_MODULES]),
    activo: true
  };
}

function getDemoSession(): SessionPayload {
  const user = getDemoUser();
  return {
    sub: user.usuario,
    rol: user.rol,
    modulos: user.modulos,
    permisos_edicion: user.permisos_edicion,
    action_permissions: user.action_permissions,
    sid: "portfolio-demo-session",
    exp: Math.floor(Date.now() / 1000) + EXPIRE_HOURS * 60 * 60
  };
}

function isValidModule(value: string): value is AppModule {
  return (VALID_MODULES as readonly string[]).includes(value);
}

function isValidAction(value: string): value is AppAction {
  return (VALID_ACTIONS as readonly string[]).includes(value);
}

function normalizeModules(modulos: unknown): string[] {
  if (!Array.isArray(modulos)) return [];
  return Array.from(new Set(modulos.filter((item): item is string => typeof item === "string" && isValidModule(item))));
}

function normalizeActions(actions: unknown): AppAction[] {
  if (!Array.isArray(actions)) return [];
  return Array.from(new Set(actions.filter((item): item is AppAction => typeof item === "string" && isValidAction(item))));
}

export function buildDefaultActionPermissions(
  rol: AppRole,
  modulos: string[],
  permisosEdicion: string[]
): ActionPermissions {
  if (rol === "admin") {
    return Object.fromEntries(
      VALID_MODULES.map((modulo) => [modulo, [...VALID_ACTIONS]])
    ) as ActionPermissions;
  }

  const output: ActionPermissions = {};
  for (const modulo of modulos) {
    const actions: AppAction[] = ["view"];
    if (permisosEdicion.includes(modulo)) {
      actions.push("create", "update", "delete", "export");
    }
    output[modulo as AppModule] = actions;
  }
  return output;
}

export function normalizeActionPermissions(
  value: unknown,
  rol: AppRole,
  modulos: string[],
  permisosEdicion: string[]
): ActionPermissions {
  const fallback = buildDefaultActionPermissions(rol, modulos, permisosEdicion);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  const output: ActionPermissions = {};
  for (const modulo of modulos) {
    const rawActions = (value as Record<string, unknown>)[modulo];
    const actions = normalizeActions(rawActions);
    output[modulo as AppModule] = actions.includes("view") ? actions : ["view", ...actions];
  }

  for (const modulo of modulos) {
    const key = modulo as AppModule;
    if (!output[key]?.length) {
      output[key] = fallback[key] ?? ["view"];
    }
  }

  return output;
}

function normalizeUser(raw: Record<string, unknown>): AppUser {
  const rol = VALID_ROLES.has(raw.rol as string) ? (raw.rol as AppRole) : "operativo";
  const modulos = normalizeModules(raw.modulos);
  const permisos_edicion = normalizeModules(raw.permisos_edicion);

  return {
    usuario: String(raw.usuario ?? "").trim(),
    nombre_completo: String(raw.nombre_completo ?? "").trim(),
    password_hash: String(raw.password_hash ?? "").trim(),
    rol,
    modulos,
    permisos_edicion,
    action_permissions: normalizeActionPermissions(raw.action_permissions, rol, modulos, permisos_edicion),
    activo: Boolean(raw.activo ?? true)
  };
}

export async function findUser(usuario: string): Promise<AppUser | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("usuarios")
    .select("usuario,nombre_completo,password_hash,rol,modulos,permisos_edicion,action_permissions,activo")
    .eq("usuario", usuario.trim())
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`No fue posible consultar el usuario en Supabase: ${error.message}`);
  }

  if (!data) return null;
  return normalizeUser(data as Record<string, unknown>);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, passwordHash);
  } catch {
    return false;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function resolveLoginRole(user: AppUser): AppRole {
  return user.rol;
}

function getJwtSecret(): Uint8Array {
  return new TextEncoder().encode(getServerEnv("JWT_SECRET"));
}

export async function signSessionToken(
  user: AppUser,
  sessionId = crypto.randomUUID()
): Promise<{ token: string; sessionId: string; expiresAt: string }> {
  const expiresAt = Math.floor(Date.now() / 1000) + EXPIRE_HOURS * 60 * 60;
  const token = await new SignJWT({
    rol: user.rol,
    modulos: user.modulos,
    permisos_edicion: user.permisos_edicion,
    action_permissions: user.action_permissions,
    sid: sessionId
  })
    .setProtectedHeader({ alg: JWT_ALG })
    .setSubject(user.usuario)
    .setExpirationTime(expiresAt)
    .sign(getJwtSecret());

  return {
    token,
    sessionId,
    expiresAt: new Date(expiresAt * 1000).toISOString()
  };
}

export async function verifySessionToken(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, getJwtSecret(), {
    algorithms: [JWT_ALG]
  });

  const rol = (VALID_ROLES.has(payload.rol as string) ? payload.rol : "operativo") as AppRole;
  const modulos = Array.isArray(payload.modulos) ? (payload.modulos as string[]) : [];
  const permisos_edicion = Array.isArray(payload.permisos_edicion) ? (payload.permisos_edicion as string[]) : [];

  return {
    sub: String(payload.sub ?? ""),
    rol,
    modulos,
    permisos_edicion,
    action_permissions: normalizeActionPermissions(payload.action_permissions, rol, modulos, permisos_edicion),
    sid: typeof payload.sid === "string" ? payload.sid : null,
    exp: Number(payload.exp ?? 0)
  };
}

export async function getSessionLightweight(): Promise<SessionPayload | null> {
  if (isPortfolioDemoMode()) {
    return getDemoSession();
  }

  const token = cookies().get(JWT_COOKIE)?.value;
  if (!token) return null;
  try {
    return await verifySessionToken(token);
  } catch {
    return null;
  }
}

export async function getSessionFromCookie(): Promise<{ user: AppUser; token: string; session: SessionPayload } | null> {
  if (isPortfolioDemoMode()) {
    return {
      user: getDemoUser(),
      token: "portfolio-demo-token",
      session: getDemoSession()
    };
  }

  const token = cookies().get(JWT_COOKIE)?.value;
  if (!token) return null;

  try {
    const session = await verifySessionToken(token);
    const user = await findUser(session.sub);
    if (!user || !user.activo) return null;
    return { user, token, session };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<{ user: AppUser; token: string; session: SessionPayload }> {
  const data = await getSessionFromCookie();
  if (!data) {
    throw new Error("UNAUTHORIZED");
  }
  return data;
}

export async function requireAdminSession(): Promise<{ user: AppUser; token: string; session: SessionPayload }> {
  const data = await requireSession();
  if (data.user.rol !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return data;
}

export function hasModuleAccess(session: SessionPayload, modulo: string): boolean {
  return session.rol === "admin" || session.modulos.includes(modulo);
}

export function hasActionPermission(session: SessionPayload, modulo: string, action: AppAction): boolean {
  if (session.rol === "admin") return true;
  const actions = session.action_permissions[modulo as AppModule] ?? [];
  return actions.includes(action);
}

export function canEdit(session: SessionPayload, modulo: string): boolean {
  return (
    hasActionPermission(session, modulo, "create") ||
    hasActionPermission(session, modulo, "update") ||
    hasActionPermission(session, modulo, "delete")
  );
}

export function buildAuthCookie(token: string) {
  return {
    name: JWT_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: EXPIRE_HOURS * 60 * 60
  };
}

export function clearAuthCookie() {
  return {
    name: JWT_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  };
}

export function unauthorizedResponse(message = "No autenticado") {
  return NextResponse.json({ detail: message }, { status: 401 });
}

export function forbiddenResponse(message = "Acceso denegado") {
  return NextResponse.json({ detail: message }, { status: 403 });
}
