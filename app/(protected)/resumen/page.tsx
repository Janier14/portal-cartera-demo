import { redirect } from "next/navigation";

import { ResumenDashboard } from "@/components/modules/resumen-dashboard";
import { getSessionLightweight } from "@/lib/auth";

function resolveFallbackRoute(modulos: string[]) {
  const firstModule = modulos[0];
  return firstModule ? `/${firstModule}` : "/login";
}

export default async function ResumenPage() {
  const session = await getSessionLightweight();
  if (!session) redirect("/login");

  const hasAccess = session.rol === "admin" || session.rol === "gerencia" || session.modulos.includes("resumen");
  if (!hasAccess) {
    redirect(resolveFallbackRoute(session.modulos));
  }

  return <ResumenDashboard />;
}
