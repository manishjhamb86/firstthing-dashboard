import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set — Supabase calls will fail until .env.local is configured."
  );
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.invalid",
  supabaseKey || "placeholder-anon-key"
);