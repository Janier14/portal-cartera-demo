import { NextResponse } from "next/server";

import { listApprovalRequests } from "@/lib/approvals";
import { listDemoApprovalRequests } from "@/lib/demo-admin";
import { isPortfolioDemoMode } from "@/lib/env";
import { hasActionPermission, requireSession, unauthorizedResponse, forbiddenResponse } from "@/lib/auth";

export async function GET(request: Request) {
  let sessionData: Awaited<ReturnType<typeof requireSession>>;
  try {
    sessionData = await requireSession();
  } catch {
    return unauthorizedResponse();
  }

  if (sessionData.user.rol !== "admin" && !hasActionPermission(sessionData.session, "usuarios", "approve")) {
    return forbiddenResponse("Acceso solo para revisores autorizados");
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "40") || 40));
  if (isPortfolioDemoMode()) {
    return NextResponse.json({ approvals: listDemoApprovalRequests(limit) });
  }
  const result = await listApprovalRequests(limit);

  if (!result.ok) {
    return NextResponse.json({ detail: result.detail ?? "No fue posible consultar las aprobaciones." }, { status: 500 });
  }

  return NextResponse.json({ approvals: result.requests });
}
