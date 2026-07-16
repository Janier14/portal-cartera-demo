import type { AppRole, AppUser, SessionPayload } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

type AuditStatus = "success" | "failure";
type AuditSource = "web" | "script" | "system";

export type AuditActor = {
  usuario?: string | null;
  nombre_completo?: string | null;
  rol?: AppRole | string | null;
  session_id?: string | null;
};

type AuditRequestContext = {
  route?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
};

type AuditPurgeSummary = {
  ok: boolean;
  retentionDays: number;
  cutoffIso: string;
  skipped: boolean;
  deletedEvents: boolean;
  deletedSessions: boolean;
};

type RecordAuditEventInput = {
  actor?: AuditActor;
  action: string;
  entityType: string;
  entityId?: string | null;
  module?: string | null;
  source?: AuditSource;
  status?: AuditStatus;
  summary: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  request?: Request | null;
  route?: string | null;
};

type OpenAuditSessionInput = {
  sessionId: string;
  user: Pick<AppUser, "usuario" | "nombre_completo" | "rol">;
  expiresAt?: string | null;
  source?: AuditSource;
  metadata?: Record<string, unknown>;
  request?: Request | null;
};

const REDACTED_KEYS = new Set([
  "password",
  "password_hash",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "cookie"
]);

const DEFAULT_AUDIT_RETENTION_DAYS = 30;
const AUDIT_PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

let lastAuditPurgeAt = 0;

function sanitizeAuditValue(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditValue(item));
  }
  if (typeof value === "object") {
    const output: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = REDACTED_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : sanitizeAuditValue(item);
    }
    return output;
  }
  return String(value);
}

export function buildRequestAuditContext(request?: Request | null): AuditRequestContext {
  if (!request) return {};

  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");

  return {
    route: request.url ? new URL(request.url).pathname : null,
    ip_address: forwardedFor?.split(",")[0]?.trim() || realIp || null,
    user_agent: request.headers.get("user-agent")
  };
}

export function buildAuditActor(input: {
  user?: Pick<AppUser, "usuario" | "nombre_completo" | "rol"> | null;
  session?: Pick<SessionPayload, "sid"> | null;
}): AuditActor {
  return {
    usuario: input.user?.usuario ?? null,
    nombre_completo: input.user?.nombre_completo ?? null,
    rol: input.user?.rol ?? null,
    session_id: input.session?.sid ?? null
  };
}

export function getAuditRetentionDays(): number {
  const parsed = Number(process.env.AUDIT_RETENTION_DAYS ?? DEFAULT_AUDIT_RETENTION_DAYS);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_AUDIT_RETENTION_DAYS;
  }
  return Math.floor(parsed);
}

function buildAuditCutoffIso(retentionDays: number): string {
  return new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

export async function purgeAuditRecords(options?: {
  retentionDays?: number;
  force?: boolean;
}): Promise<AuditPurgeSummary> {
  const retentionDays = options?.retentionDays ?? getAuditRetentionDays();
  const cutoffIso = buildAuditCutoffIso(retentionDays);

  if (!options?.force && Date.now() - lastAuditPurgeAt < AUDIT_PURGE_INTERVAL_MS) {
    return {
      ok: true,
      retentionDays,
      cutoffIso,
      skipped: true,
      deletedEvents: false,
      deletedSessions: false
    };
  }

  lastAuditPurgeAt = Date.now();

  try {
    const supabase = createServerSupabase();
    const { error: eventsError } = await supabase.from("audit_events").delete().lt("created_at", cutoffIso);
    if (eventsError) {
      console.error("[audit] No fue posible purgar eventos:", eventsError.message);
      return {
        ok: false,
        retentionDays,
        cutoffIso,
        skipped: false,
        deletedEvents: false,
        deletedSessions: false
      };
    }

    const { error: sessionsError } = await supabase
      .from("audit_user_sessions")
      .delete()
      .or(`logged_out_at.lt.${cutoffIso},and(logged_out_at.is.null,expires_at.lt.${cutoffIso})`);

    if (sessionsError) {
      console.error("[audit] No fue posible purgar sesiones:", sessionsError.message);
      return {
        ok: false,
        retentionDays,
        cutoffIso,
        skipped: false,
        deletedEvents: true,
        deletedSessions: false
      };
    }

    return {
      ok: true,
      retentionDays,
      cutoffIso,
      skipped: false,
      deletedEvents: true,
      deletedSessions: true
    };
  } catch (error) {
    console.error("[audit] Error purgando registros:", error);
    return {
      ok: false,
      retentionDays,
      cutoffIso,
      skipped: false,
      deletedEvents: false,
      deletedSessions: false
    };
  }
}

export async function touchAuditSession(sessionId?: string | null): Promise<void> {
  if (!sessionId) return;

  try {
    const supabase = createServerSupabase();
    const { error } = await supabase
      .from("audit_user_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("session_id", sessionId)
      .is("logged_out_at", null);

    if (error) {
      console.error("[audit] No fue posible actualizar last_seen_at:", error.message);
    }
  } catch (error) {
    console.error("[audit] Error actualizando sesion:", error);
  }
}

export async function openAuditSession(input: OpenAuditSessionInput): Promise<void> {
  try {
    await purgeAuditRecords();

    const supabase = createServerSupabase();
    const context = buildRequestAuditContext(input.request);
    const payload = {
      session_id: input.sessionId,
      usuario: input.user.usuario,
      nombre_completo: input.user.nombre_completo,
      rol: input.user.rol,
      source: input.source ?? "web",
      expires_at: input.expiresAt ?? null,
      ip_address: context.ip_address ?? null,
      user_agent: context.user_agent ?? null,
      metadata: sanitizeAuditValue(input.metadata ?? {})
    };

    const { error } = await supabase.from("audit_user_sessions").insert(payload);
    if (error) {
      console.error("[audit] No fue posible abrir sesion:", error.message);
    }
  } catch (error) {
    console.error("[audit] Error creando sesion:", error);
  }
}

export async function closeAuditSession(
  sessionId?: string | null,
  request?: Request | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (!sessionId) return;

  try {
    await purgeAuditRecords();

    const supabase = createServerSupabase();
    const context = buildRequestAuditContext(request);
    const payload = {
      last_seen_at: new Date().toISOString(),
      logged_out_at: new Date().toISOString(),
      ip_address: context.ip_address ?? null,
      user_agent: context.user_agent ?? null,
      metadata: sanitizeAuditValue(metadata ?? {})
    };

    const { error } = await supabase.from("audit_user_sessions").update(payload).eq("session_id", sessionId);
    if (error) {
      console.error("[audit] No fue posible cerrar sesion:", error.message);
    }
  } catch (error) {
    console.error("[audit] Error cerrando sesion:", error);
  }
}

export async function recordAuditEvent(input: RecordAuditEventInput): Promise<void> {
  try {
    await purgeAuditRecords();

    const supabase = createServerSupabase();
    const context = buildRequestAuditContext(input.request);
    const payload = {
      actor_usuario: input.actor?.usuario ?? null,
      actor_nombre: input.actor?.nombre_completo ?? null,
      actor_rol: input.actor?.rol ?? null,
      session_id: input.actor?.session_id ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      module: input.module ?? null,
      source: input.source ?? "web",
      status: input.status ?? "success",
      summary: input.summary,
      route: input.route ?? context.route ?? null,
      ip_address: context.ip_address ?? null,
      user_agent: context.user_agent ?? null,
      before_data: sanitizeAuditValue(input.before),
      after_data: sanitizeAuditValue(input.after),
      metadata: sanitizeAuditValue(input.metadata ?? {})
    };

    const { error } = await supabase.from("audit_events").insert(payload);
    if (error) {
      console.error("[audit] No fue posible registrar evento:", error.message);
    }

    await touchAuditSession(input.actor?.session_id);
  } catch (error) {
    console.error("[audit] Error registrando evento:", error);
  }
}
