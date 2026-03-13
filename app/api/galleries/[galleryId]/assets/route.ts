import { z } from "zod";

import { ensureProjectContext, readPhotographerId } from "@/lib/auth";
import { isMissingSchemaObjectError } from "@/lib/db-errors";
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

function toLogicalAssetKey(input: {
  filename: string;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  width: number;
  height: number;
}) {
  const mimePart = (input.mimeType ?? "unknown").trim().toLowerCase();
  const sizePart = Number.isFinite(input.fileSizeBytes) ? String(input.fileSizeBytes) : "unknown";
  return `${input.filename.trim().toLowerCase()}::${mimePart}::${sizePart}::${input.width}::${input.height}`;
}

async function ensureGalleryOwnership(galleryId: string, photographerId: string) {
  const supabase = createAdminClient();
  const gallery = await supabase
    .from("galleries")
    .select("id,cover_asset_id")
    .eq("id", galleryId)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (gallery.error) {
    return { error: fail("DB_ERROR", gallery.error.message, 500) } as const;
  }

  if (!gallery.data) {
    return { error: fail("GALLERY_NOT_FOUND", "Gallery not found", 404) } as const;
  }

  return { supabase, gallery: gallery.data } as const;
}

async function updateSortOrderRows(input: {
  supabase: ReturnType<typeof createAdminClient>;
  galleryId: string;
  orderedAssetIds: string[];
}) {
  const { supabase, galleryId, orderedAssetIds } = input;

  for (const [index, assetId] of orderedAssetIds.entries()) {
    const update = await supabase
      .from("gallery_assets")
      .update({ sort_order: index })
      .eq("id", assetId)
      .eq("gallery_id", galleryId)
      .eq("is_active", true);

    if (update.error) {
      return update.error;
    }
  }

  return null;
}

async function touchGalleryUpdatedAt(input: {
  supabase: ReturnType<typeof createAdminClient>;
  galleryId: string;
}) {
  const update = await input.supabase
    .from("galleries")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", input.galleryId);

  return update.error;
}

export async function GET(request: Request, context: RouteContext) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const { galleryId } = await context.params;
  const owned = await ensureGalleryOwnership(galleryId, auth.photographerId);
  if ("error" in owned) return owned.error;

  const fullAssetsQuery = await owned.supabase
    .from("gallery_assets")
    .select("id,filename,mime_type,file_size_bytes,width,height,storage_key_preview,watermark_applied,sort_order,is_active")
    .eq("gallery_id", galleryId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  let assetsData: Array<{
    id: string;
    filename: string;
    width: number;
    height: number;
    storage_key_preview: string;
    watermark_applied: boolean;
    sort_order: number;
    mime_type?: string | null;
    file_size_bytes?: number | null;
  }> = [];

  if (fullAssetsQuery.error && isMissingSchemaObjectError(fullAssetsQuery.error)) {
    const fallbackAssetsQuery = await owned.supabase
      .from("gallery_assets")
      .select("id,filename,width,height,storage_key_preview,watermark_applied,sort_order,is_active")
      .eq("gallery_id", galleryId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (fallbackAssetsQuery.error) {
      return fail("DB_ERROR", fallbackAssetsQuery.error.message, 500);
    }
    assetsData = fallbackAssetsQuery.data;
  } else if (fullAssetsQuery.error) {
    return fail("DB_ERROR", fullAssetsQuery.error.message, 500);
  } else {
    assetsData = fullAssetsQuery.data;
  }

  const duplicateAssetIds: string[] = [];
  const duplicateReplacementById = new Map<string, string>();
  const canonicalByLogicalKey = new Map<string, (typeof assetsData)[number]>();

  for (const asset of assetsData) {
    const logicalKey = toLogicalAssetKey({
      filename: asset.filename,
      mimeType: asset.mime_type,
      fileSizeBytes: asset.file_size_bytes,
      width: asset.width,
      height: asset.height,
    });
    const existingCanonical = canonicalByLogicalKey.get(logicalKey);
    if (!existingCanonical) {
      canonicalByLogicalKey.set(logicalKey, asset);
      continue;
    }
    duplicateAssetIds.push(asset.id);
    duplicateReplacementById.set(asset.id, existingCanonical.id);
  }

  if (duplicateAssetIds.length > 0) {
    const markDuplicatesInactive = await owned.supabase
      .from("gallery_assets")
      .update({ is_active: false })
      .eq("gallery_id", galleryId)
      .in("id", duplicateAssetIds);

    if (markDuplicatesInactive.error) {
      return fail("DB_ERROR", markDuplicatesInactive.error.message, 500);
    }
  }

  const duplicateAssetIdSet = new Set(duplicateAssetIds);
  const normalizedAssets = assetsData.filter((asset) => !duplicateAssetIdSet.has(asset.id));
  const activeAssetIds = new Set(normalizedAssets.map((asset) => asset.id));

  let nextCoverAssetId = owned.gallery.cover_asset_id;
  if (nextCoverAssetId && duplicateReplacementById.has(nextCoverAssetId)) {
    nextCoverAssetId = duplicateReplacementById.get(nextCoverAssetId) ?? null;
  }
  if (nextCoverAssetId && !activeAssetIds.has(nextCoverAssetId)) {
    nextCoverAssetId = null;
  }

  const coverNeedsReset = owned.gallery.cover_asset_id !== nextCoverAssetId;
  if (coverNeedsReset) {
    const updateCover = await owned.supabase.from("galleries").update({ cover_asset_id: nextCoverAssetId }).eq("id", galleryId);
    if (updateCover.error) {
      return fail("DB_ERROR", updateCover.error.message, 500);
    }
  }

  const orderNeedsNormalization = normalizedAssets.some((asset, index) => asset.sort_order !== index);
  if (orderNeedsNormalization && normalizedAssets.length > 0) {
    const reorderError = await updateSortOrderRows({
      supabase: owned.supabase,
      galleryId,
      orderedAssetIds: normalizedAssets.map((asset) => asset.id),
    });
    if (reorderError) {
      return fail("DB_ERROR", reorderError.message, 500);
    }
  }

  const bucketName = getAssetsBucketName();
  const previewUrlByKey = new Map<string, string | null>();

  await Promise.all(
    normalizedAssets.map(async (asset) => {
      const signed = await owned.supabase.storage.from(bucketName).createSignedUrl(asset.storage_key_preview, 60 * 60);
      previewUrlByKey.set(asset.storage_key_preview, signed.error ? null : signed.data.signedUrl);
    }),
  );

  return ok({
    normalized: {
      coverReset: coverNeedsReset,
      duplicatesRemoved: duplicateAssetIds.length,
      orderNormalized: orderNeedsNormalization,
    },
    assets: normalizedAssets.map((asset, index) => ({
      id: asset.id,
      filename: asset.filename,
      width: asset.width,
      height: asset.height,
      previewKey: asset.storage_key_preview,
      previewUrl: previewUrlByKey.get(asset.storage_key_preview) ?? null,
      watermark: asset.watermark_applied,
      sortOrder: index,
    })),
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const { galleryId } = await context.params;
  const projectContext = ensureProjectContext(request.headers, galleryId);
  if ("error" in projectContext) return projectContext.error;

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

    const touchError = await touchGalleryUpdatedAt({ supabase: owned.supabase, galleryId });
    if (touchError) {
      return fail("DB_ERROR", touchError.message, 500);
    }

    return ok({ updated: true, projectId: galleryId });
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

  const reorderError = await updateSortOrderRows({
    supabase: owned.supabase,
    galleryId,
    orderedAssetIds: parsed.data.orderedAssetIds,
  });
  if (reorderError) {
    return fail("DB_ERROR", reorderError.message, 500);
  }

  const touchError = await touchGalleryUpdatedAt({ supabase: owned.supabase, galleryId });
  if (touchError) {
    return fail("DB_ERROR", touchError.message, 500);
  }

  return ok({ updated: true, projectId: galleryId });
}
