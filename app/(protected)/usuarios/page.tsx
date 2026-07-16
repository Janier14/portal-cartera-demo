import { redirect } from "next/navigation";

import { UsuariosDashboard } from "@/components/modules/usuarios-dashboard";
import { getSessionLightweight } from "@/lib/auth";

export default async function UsuariosPage() {
  const session = await getSessionLightweight();
  if (!session) redirect("/login");

  return <UsuariosDashboard currentUserRol={session.rol} />;
}
