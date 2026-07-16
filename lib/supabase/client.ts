"use client";

import { createClient } from "@supabase/supabase-js";

import { assertSupabaseEnabled, getPublicEnv } from "@/lib/env";

assertSupabaseEnabled();

export const supabase = createClient(
  getPublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
  getPublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
);
