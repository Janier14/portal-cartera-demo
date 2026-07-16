import type { AppAction, AppModule, AppRole, SessionPayload } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type ApprovalRequestRow = {
  id: string;
  created_at: string;
  reviewed_at: string | null;
  requested_by_usuario: string;
  requested_by_nombre: string | null;
  requested_by_rol: string | null;
  reviewed_by_usuario: string | null;
  reviewed_by_nombre: string | null;
  reviewed_by_rol: string | null;
  module: string;
  entity_type: string;
  entity_id: string;
  action: string;
  status: ApprovalStatus;
  summary: string;
  reason: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
};

type ApprovalActor = {
  usuario: string;
  nombre_completo?: string | null;
  rol: AppRole;
};

type CreateApprovalInput = {
  actor: ApprovalActor;
  module: AppModule;
  entityType: string;
  entityId: string;
  action: Extract<AppAction, "create" | "update" | "delete">;
  summary: string;
  reason?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
};

export async function createApprovalRequest(input: CreateApprovalInput): Promise<{ ok: boolean; id?: string; detail?: string }> {
  const supabase = createServerSupabase();
  const payload = {
    requested_by_usuario: input.actor.usuario,
    requested_by_nombre: input.actor.nombre_completo ?? null,
    requested_by_rol: input.actor.rol,
    module: input.module,
    entity_type: input.entityType,
    entity_id: input.entityId,
    action: input.action,
    status: "pending",
    summary: input.summary,
    reason: input.reason ?? null,
    before_data: input.before ?? null,
    after_data: input.after ?? null,
    metadata: input.metadata ?? {}
  };

  const { data, error } = await supabase.from("approval_requests").insert(payload).select("id").limit(1).maybeSingle();
  if (error) {
    return { ok: false, detail: error.message };
  }

  return { ok: true, id: String(data?.id ?? "") };
}

export async function listApprovalRequests(limit = 50): Promise<{ ok: boolean; requests: ApprovalRequestRow[]; detail?: string }> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("approval_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { ok: false, requests: [], detail: error.message };
  }

  return { ok: true, requests: (data ?? []) as ApprovalRequestRow[] };
}

export function canRequestApproval(session: SessionPayload, modulo: string): boolean {
  return session.rol !== "admin" && session.modulos.includes(modulo);
}
