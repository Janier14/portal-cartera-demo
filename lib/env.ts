const requiredServerEnv = [
  "JWT_SECRET",
  "SUPABASE_URL"
] as const;

export function isPortfolioDemoMode(): boolean {
  const value = process.env.PORTFOLIO_DEMO_MODE?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function assertSupabaseEnabled(): void {
  if (isPortfolioDemoMode()) {
    throw new Error("Supabase is disabled while PORTFOLIO_DEMO_MODE is enabled.");
  }
}

export function getServerEnv(name: (typeof requiredServerEnv)[number]): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function getSupabaseServerKey(): string {
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRole) return serviceRole;

  const fallback = process.env.SUPABASE_KEY;
  if (!fallback) {
    throw new Error("Missing required env var: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY");
  }
  return fallback;
}

export function getPublicEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}
