import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { getSessionLightweight } from "@/lib/auth";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const session = await getSessionLightweight();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="module-layout">
      <AppShell usuario={session.sub} rol={session.rol} modulos={session.modulos} />
      <main className="module-main">
        <div className="module-container">{children}</div>
      </main>
    </div>
  );
}
