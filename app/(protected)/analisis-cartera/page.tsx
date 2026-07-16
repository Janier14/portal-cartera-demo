import { redirect } from "next/navigation";

import { AnalisisCarteraDashboard } from "@/components/modules/analisis-cartera-dashboard";
import { canEdit, getSessionLightweight } from "@/lib/auth";

function resolveFallbackRoute(modulos: string[]) {
  const firstModule = modulos[0];
  return firstModule ? `/${firstModule}` : "/login";
}

export default async function AnalisisCarteraPage() {
  const session = await getSessionLightweight();
  if (!session) redirect("/login");

  if (!session.modulos.includes("analisis-cartera")) {
    redirect(resolveFallbackRoute(session.modulos));
  }

  return <AnalisisCarteraDashboard canEdit={canEdit(session, "analisis-cartera")} session={session} />;
}
