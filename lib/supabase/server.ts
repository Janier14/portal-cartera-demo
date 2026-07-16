import { createClient } from "@supabase/supabase-js";

import { assertSupabaseEnabled, getServerEnv, getSupabaseServerKey } from "@/lib/env";

export function createServerSupabase() {
  assertSupabaseEnabled();

  return createClient(
    getServerEnv("SUPABASE_URL"),
    getSupabaseServerKey(),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );
}
