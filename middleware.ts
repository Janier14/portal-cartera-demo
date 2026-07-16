import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isPortfolioDemoMode } from "@/lib/env";

const protectedPrefixes = ["/resumen", "/arl", "/cartera", "/seguros", "/directorio", "/analisis-cartera", "/usuarios"];
const adminOnlyPrefixes = ["/usuarios"];
const moduleRoutes: Record<string, string> = {
  "/resumen": "resumen",
  "/arl": "arl",
  "/cartera": "cartera",
  "/seguros": "seguros",
  "/directorio": "directorio",
  "/analisis-cartera": "analisis-cartera"
};

async function verifyToken(token: string): Promise<{ rol: string; modulos: string[] } | null> {
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "");
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const rol = typeof payload.rol === "string" ? payload.rol : "";
    const modulos = Array.isArray(payload.modulos) ? (payload.modulos as string[]) : [];
    return { rol, modulos };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPortfolioDemoMode()) {
    if (pathname === "/" || pathname === "/login") {
      return NextResponse.redirect(new URL("/resumen", request.url));
    }
    return NextResponse.next();
  }

  const token = request.cookies.get("cmym_token")?.value;

  const needsAuth = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (!needsAuth) return NextResponse.next();

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const session = await verifyToken(token);
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { rol, modulos } = session;

  const adminOnly = adminOnlyPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (adminOnly && rol !== "admin") {
    const fallback = modulos[0] ? `/${modulos[0]}` : "/login";
    return NextResponse.redirect(new URL(fallback, request.url));
  }

  for (const [prefix, modulo] of Object.entries(moduleRoutes)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      if (prefix === "/resumen" && (rol === "admin" || rol === "gerencia")) {
        break;
      }
      if (prefix === "/analisis-cartera" && !modulos.includes(modulo)) {
        const fallback = modulos[0] ? `/${modulos[0]}` : rol === "admin" ? "/usuarios" : "/login";
        return NextResponse.redirect(new URL(fallback, request.url));
      }
      if (!modulos.includes(modulo) && rol !== "admin") {
        const fallback = modulos[0] ? `/${modulos[0]}` : "/login";
        return NextResponse.redirect(new URL(fallback, request.url));
      }
      break;
    }
  }

  if (rol === "admin") return NextResponse.next();

  return NextResponse.next();
}

export const config = {
  matcher: ["/resumen/:path*", "/arl/:path*", "/cartera/:path*", "/seguros/:path*", "/directorio/:path*", "/analisis-cartera/:path*", "/usuarios/:path*"]
};
