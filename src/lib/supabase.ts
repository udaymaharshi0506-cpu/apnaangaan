import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment variables."
  );
}

/** Singleton Supabase client for server-side use (Storage, Realtime, REST). */
const globalForSupabase = globalThis as typeof globalThis & {
  __supabaseClient?: ReturnType<typeof createClient>;
};

export const supabase =
  globalForSupabase.__supabaseClient ?? createClient(supabaseUrl, supabaseKey);

if (process.env.NODE_ENV !== "production") {
  globalForSupabase.__supabaseClient = supabase;
}
