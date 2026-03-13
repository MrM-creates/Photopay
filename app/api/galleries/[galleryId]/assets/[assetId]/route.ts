import { ensureProjectContext, readPhotographerId } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ galleryId: string; assetId: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const { galleryId, assetId } = await context.params;
  const projectContext = ensureProjectContext(request.headers, galleryId);
  if ("error" in projectContext) return projectContext.error;

  const supabase = createAdminClient();

  const gallery = await supabase
    .from("galleries")
    .select("id,cover_asset_id")
    .eq("id", galleryId)
    .eq("photographer_id", auth.photographerId)
    .maybeSingle();

  if (gallery.error) {
    return fail("DB_ERROR", gallery.error.message, 500);
  }

  if (!gallery.data) {
    return fail("GALLERY_NOT_FOUND", "Gallery not found", 404);
  }

  const asset = await supabase
    .from("gallery_assets")
    .select("id")
    .eq("id", assetId)
    .eq("gallery_id", galleryId)
    .eq("is_active", true)
    .maybeSingle();

  if (asset.error) {
    return fail("DB_ERROR", asset.error.message, 500);
  }

  if (!asset.data) {
    return fail("ASSET_NOT_FOUND", "Asset not found", 404);
  }

  const disable = await supabase.from("gallery_assets").update({ is_active: false }).eq("id", assetId).eq("gallery_id", galleryId);
  if (disable.error) {
    return fail("DB_ERROR", disable.error.message, 500);
  }

  if (gallery.data.cover_asset_id === assetId) {
    const clearCover = await supabase.from("galleries").update({ cover_asset_id: null }).eq("id", galleryId);
    if (clearCover.error) {
      return fail("DB_ERROR", clearCover.error.message, 500);
    }
  }

  const touchGallery = await supabase
    .from("galleries")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", galleryId)
    .eq("photographer_id", auth.photographerId);

  if (touchGallery.error) {
    return fail("DB_ERROR", touchGallery.error.message, 500);
  }

  return ok({ deleted: true, projectId: galleryId });
}
