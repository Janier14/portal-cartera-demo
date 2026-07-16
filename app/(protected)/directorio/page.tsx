import { redirect } from "next/navigation";

import { DirectorioDashboard } from "@/components/modules/directorio-dashboard";
import { canEdit, getSessionLightweight } from "@/lib/auth";

export default async function DirectorioPage() {
  const session = await getSessionLightweight();
  if (!session) redirect("/login");

  return <DirectorioDashboard canEdit={canEdit(session, "directorio")} />;
}
