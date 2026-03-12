import { createClient } from "@supabase/supabase-js";

import { getEnv } from "@/lib/env";

export function createAdminClient() {
  const env = getEnv();

  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
