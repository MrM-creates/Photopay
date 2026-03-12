import { ensureProjectContext, readPhotographerId } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase";

type RouteContext = {
  params: Promise<{ galleryId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const { galleryId } = await context.params;
  const projectContext = ensureProjectContext(request.headers, galleryId);
  if ("error" in projectContext) return projectContext.error;

  const supabase = createAdminClient();

  const gallery = await supabase
    .from("galleries")
    .select("id,status,published_at")
    .eq("id", galleryId)
    .eq("photographer_id", auth.photographerId)
    .maybeSingle();

  if (gallery.error) {
    return fail("DB_ERROR", gallery.error.message, 500);
  }

  if (!gallery.data) {
    return fail("GALLERY_NOT_FOUND", "Gallery not found", 404);
  }

  if (gallery.data.status === "published") {
    return ok({
      id: gallery.data.id,
      projectId: gallery.data.id,
      status: gallery.data.status,
      publishedAt: gallery.data.published_at,
      idempotent: true,
    });
  }

  const update = await supabase
    .from("galleries")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
    })
    .eq("id", galleryId)
    .eq("photographer_id", auth.photographerId)
    .select("id,status,published_at")
    .maybeSingle();

  if (update.error) {
    return fail("DB_ERROR", update.error.message, 500);
  }

  if (!update.data) return fail("GALLERY_NOT_FOUND", "Gallery not found", 404);

  return ok({
    id: update.data.id,
    projectId: update.data.id,
    status: update.data.status,
    publishedAt: update.data.published_at,
    idempotent: false,
  });
}
