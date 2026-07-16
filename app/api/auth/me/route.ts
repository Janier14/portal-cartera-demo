import { NextResponse } from "next/server";

import { requireSession, unauthorizedResponse } from "@/lib/auth";

export async function GET() {
  try {
    const { user } = await requireSession();
    return NextResponse.json({
      usuario: user.usuario,
      nombre_completo: user.nombre_completo,
      rol: user.rol
    });
  } catch {
    return unauthorizedResponse();
  }
}
