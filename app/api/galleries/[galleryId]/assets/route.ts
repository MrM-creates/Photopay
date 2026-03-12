import { z } from "zod";

import { readPhotographerId } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getAssetsBucketName } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ galleryId: string }>;
};

const patchSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("reorder"),
    orderedAssetIds: z.array(z.string().uuid()).min(1).max(500),
  }),
  z.object({
    operation: z.literal("cover"),
    assetId: z.string().uuid(),
  }),
]);

async function ensureGalleryOwnership(galleryId: string, photographerId: string) {
  const supabase = createAdminClient();
  const gallery = await supabase
    .from("galleries")
    .select("id")
    .eq("id", galleryId)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (gallery.error) {
    return { error: fail("DB_ERROR", gallery.error.message, 500) } as const;
  }

  if (!gallery.data) {
    return { error: fail("GALLERY_NOT_FOUND", "Gallery not found", 404) } as const;
  }

  return { supabase } as const;
}

export async function GET(request: Request, context: RouteContext) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const { galleryId } = await context.params;
  const owned = await ensureGalleryOwnership(galleryId, auth.photographerId);
  if ("error" in owned) return owned.error;

  const assetsQuery = await owned.supabase
    .from("gallery_assets")
    .select("id,filename,width,height,storage_key_preview,watermark_applied,sort_order,is_active")
    .eq("gallery_id", galleryId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (assetsQuery.error) {
    return fail("DB_ERROR", assetsQuery.error.message, 500);
  }

  const bucketName = getAssetsBucketName();
  const previewUrlByKey = new Map<string, string | null>();

  await Promise.all(
    assetsQuery.data.map(async (asset) => {
      const signed = await owned.supabase.storage.from(bucketName).createSignedUrl(asset.storage_key_preview, 60 * 60);
      previewUrlByKey.set(asset.storage_key_preview, signed.error ? null : signed.data.signedUrl);
    }),
  );

  return ok({
    assets: assetsQuery.data.map((asset) => ({
      id: asset.id,
      filename: asset.filename,
      width: asset.width,
      height: asset.height,
      previewKey: asset.storage_key_preview,
      previewUrl: previewUrlByKey.get(asset.storage_key_preview) ?? null,
      watermark: asset.watermark_applied,
      sortOrder: asset.sort_order,
    })),
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const { galleryId } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid payload", 422, { issues: parsed.error.issues });
  }

  const owned = await ensureGalleryOwnership(galleryId, auth.photographerId);
  if ("error" in owned) return owned.error;

  if (parsed.data.operation === "cover") {
    const verifyAsset = await owned.supabase
      .from("gallery_assets")
      .select("id")
      .eq("id", parsed.data.assetId)
      .eq("gallery_id", galleryId)
      .eq("is_active", true)
      .maybeSingle();

    if (verifyAsset.error) {
      return fail("DB_ERROR", verifyAsset.error.message, 500);
    }

    if (!verifyAsset.data) {
      return fail("ASSET_NOT_FOUND", "Asset not found", 404);
    }

    const update = await owned.supabase.from("galleries").update({ cover_asset_id: parsed.data.assetId }).eq("id", galleryId);
    if (update.error) {
      return fail("DB_ERROR", update.error.message, 500);
    }

    return ok({ updated: true });
  }

  const activeAssets = await owned.supabase
    .from("gallery_assets")
    .select("id")
    .eq("gallery_id", galleryId)
    .eq("is_active", true);

  if (activeAssets.error) {
    return fail("DB_ERROR", activeAssets.error.message, 500);
  }

  const activeIds = new Set(activeAssets.data.map((asset) => asset.id));
  if (activeIds.size !== parsed.data.orderedAssetIds.length) {
    return fail("VALIDATION_ERROR", "orderedAssetIds must contain all active assets exactly once", 422);
  }

  if (parsed.data.orderedAssetIds.some((assetId) => !activeIds.has(assetId))) {
    return fail("VALIDATION_ERROR", "orderedAssetIds contains invalid asset IDs", 422);
  }

  for (let index = 0; index < parsed.data.orderedAssetIds.length; index += 1) {
    const assetId = parsed.data.orderedAssetIds[index];
    const update = await owned.supabase
      .from("gallery_assets")
      .update({ sort_order: index })
      .eq("id", assetId)
      .eq("gallery_id", galleryId);

    if (update.error) {
      return fail("DB_ERROR", update.error.message, 500);
    }
  }

  return ok({ updated: true });
}

