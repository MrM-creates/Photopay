import { readPhotographerId } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase";

type RouteContext = {
  params: Promise<{ galleryId: string }>;
};

export const runtime = "nodejs";

export async function DELETE(request: Request, context: RouteContext) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const { galleryId } = await context.params;
  const supabase = createAdminClient();

  const gallery = await supabase
    .from("galleries")
    .select("id,title")
    .eq("id", galleryId)
    .eq("photographer_id", auth.photographerId)
    .maybeSingle();

  if (gallery.error) {
    return fail("DB_ERROR", gallery.error.message, 500);
  }

  if (!gallery.data) {
    return fail("GALLERY_NOT_FOUND", "Gallery not found", 404);
  }

  const del = await supabase
    .from("galleries")
    .delete()
    .eq("id", galleryId)
    .eq("photographer_id", auth.photographerId);

  if (del.error?.code === "23503") {
    return fail(
      "PROJECT_DELETE_BLOCKED",
      "Project cannot be deleted because related orders or downloads already exist.",
      409,
    );
  }

  if (del.error) {
    return fail("DB_ERROR", del.error.message, 500);
  }

  return ok({
    id: gallery.data.id,
    title: gallery.data.title,
    deleted: true,
  });
}
