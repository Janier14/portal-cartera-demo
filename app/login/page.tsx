import { redirect } from "next/navigation";

import { LoginScreen } from "@/components/auth/login-screen";
import { getSessionFromCookie } from "@/lib/auth";
import { isPortfolioDemoMode } from "@/lib/env";

export default async function LoginPage() {
  if (isPortfolioDemoMode()) {
    redirect("/resumen");
  }

  const session = await getSessionFromCookie();

  if (session) {
    const firstModule = session.session.modulos[0];
    redirect(firstModule ? `/${firstModule}` : "/arl");
  }

  return <LoginScreen />;
}
