import { NextResponse } from "next/server";

import { getSessionFromCookie } from "@/lib/auth";

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ valid: false, detail: "Sesion invalida" }, { status: 401 });
  }

  return NextResponse.json({
    valid: true,
    usuario: session.user.usuario,
    rol: session.session.rol
  });
}
