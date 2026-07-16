import { NextRequest, NextResponse } from "next/server";

import { getAuditRetentionDays, purgeAuditRecords } from "@/lib/audit";
import { requireAdminSession, unauthorizedResponse } from "@/lib/auth";
import { listDemoAuditEvents } from "@/lib/demo-admin";
import { isPortfolioDemoMode } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return unauthorizedResponse("Acceso solo para administradores");
  }

  const retentionDays = getAuditRetentionDays();
  if (isPortfolioDemoMode()) {
    const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? "25") || 25));
    return NextResponse.json(listDemoAuditEvents(limit));
  }

  await purgeAuditRecords({ retentionDays });

  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? "25") || 25));
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("audit_events")
    .select("id,created_at,actor_usuario,actor_nombre,actor_rol,action,entity_type,entity_id,module,source,status,summary,metadata")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ eventos: data ?? [], retentionDays });
}
