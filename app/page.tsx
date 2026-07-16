import { redirect } from "next/navigation";

import { isPortfolioDemoMode } from "@/lib/env";

export default function HomePage() {
  if (isPortfolioDemoMode()) {
    redirect("/resumen");
  }

  redirect("/login");
}
