import { fail, ok } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createAdminClient();

  const latestGallery = await supabase
    .from("galleries")
    .select("photographer_id,created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestGallery.error) {
    return fail("DB_ERROR", latestGallery.error.message, 500);
  }

  if (latestGallery.data?.photographer_id) {
    return ok({ photographerId: latestGallery.data.photographer_id });
  }

  const oldestPhotographer = await supabase
    .from("photographers")
    .select("id,created_at")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (oldestPhotographer.error) {
    return fail("DB_ERROR", oldestPhotographer.error.message, 500);
  }

  if (oldestPhotographer.data?.id) {
    return ok({ photographerId: oldestPhotographer.data.id });
  }

  const generatedId = crypto.randomUUID();

  const createPhotographer = await supabase.from("photographers").insert({
    id: generatedId,
    auth_user_id: generatedId,
    display_name: "Photographer",
  });

  if (createPhotographer.error) {
    return fail("DB_ERROR", createPhotographer.error.message, 500);
  }

  return ok({ photographerId: generatedId });
}
