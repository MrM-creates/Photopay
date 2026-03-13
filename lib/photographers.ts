import { createAdminClient } from "@/lib/supabase";

export async function ensurePhotographerRecord(
  supabase: ReturnType<typeof createAdminClient>,
  photographerId: string,
) {
  const upsert = await supabase.from("photographers").upsert(
    {
      id: photographerId,
      auth_user_id: photographerId,
      display_name: "Photographer",
    },
    {
      onConflict: "id",
    },
  );

  return upsert.error;
}
