import { z } from "zod";

import { ensureProjectContext, readPhotographerId } from "@/lib/auth";
import { isMissingSchemaObjectError } from "@/lib/db-errors";
import { fail, ok } from "@/lib/http";
import { getAssetsBucketName } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

const finalizeSchema = z.object({
  files: z
    .array(
      z.object({
        filename: z.string().trim().min(1).max(255),
        mimeType: z.string().trim().min(3).max(100).default("image/jpeg"),
        fileSizeBytes: z.number().int().min(1).default(1_500_000),
        width: z.number().int().min(100).default(2400),
        height: z.number().int().min(100).default(1600),
        storageKeyOriginal: z.string().trim().min(3).max(500).optional(),
        storageKeyPreview: z.string().trim().min(3).max(500).optional(),
        watermarkApplied: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(200),
});

type RouteContext = {
  params: Promise<{ galleryId: string }>;
};

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

export async function POST(request: Request, context: RouteContext) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const { galleryId } = await context.params;
  const projectContext = ensureProjectContext(request.headers, galleryId);
  if ("error" in projectContext) return projectContext.error;

  const payload = await request.json().catch(() => null);
  const parsed = finalizeSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid payload", 422, {
      issues: parsed.error.issues,
    });
  }

  const supabase = createAdminClient();

  const gallery = await supabase
    .from("galleries")
    .select("id")
    .eq("id", galleryId)
    .eq("photographer_id", auth.photographerId)
    .maybeSingle();

  if (gallery.error) {
    return fail("DB_ERROR", gallery.error.message, 500);
  }

  if (!gallery.data) {
    return fail("GALLERY_NOT_FOUND", "Gallery not found", 404);
  }

  const existingAssets = await supabase
    .from("gallery_assets")
    .select("sort_order")
    .eq("gallery_id", galleryId)
    .eq("is_active", true)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (existingAssets.error) {
    return fail("DB_ERROR", existingAssets.error.message, 500);
  }

  const offset = existingAssets.data.length > 0 ? existingAssets.data[0].sort_order + 1 : 0;

  const preparedFiles = parsed.data.files.map((file) => {
    const uuid = crypto.randomUUID();
    const storageKeyOriginal = file.storageKeyOriginal ?? `orig/${galleryId}/${uuid}/${file.filename}`;
    const storageKeyPreview = file.storageKeyPreview ?? `preview/${galleryId}/${uuid}/${file.filename}`;
    const watermarkApplied = file.watermarkApplied ?? true;

    return {
      filename: file.filename,
      width: file.width,
      height: file.height,
      mimeType: file.mimeType,
      fileSizeBytes: file.fileSizeBytes,
      storageKeyOriginal,
      storageKeyPreview,
      watermarkApplied,
    };
  });

  const existingByStorage = await supabase
    .from("gallery_assets")
    .select("id,filename,width,height,storage_key_preview,watermark_applied,sort_order,storage_key_original")
    .eq("gallery_id", galleryId)
    .in(
      "storage_key_original",
      preparedFiles.map((file) => file.storageKeyOriginal),
    );

  if (existingByStorage.error) {
    return fail("DB_ERROR", existingByStorage.error.message, 500);
  }

  const existingMap = new Map(
    existingByStorage.data.map((asset) => [asset.storage_key_original, asset]),
  );

  const candidateFilenames = Array.from(new Set(preparedFiles.map((file) => file.filename)));
  const logicalFull = await supabase
    .from("gallery_assets")
    .select("id,filename,mime_type,file_size_bytes,width,height,storage_key_preview,watermark_applied,sort_order")
    .eq("gallery_id", galleryId)
    .eq("is_active", true)
    .in("filename", candidateFilenames);

  let existingLogicalMap = new Map<
    string,
    {
      id: string;
      filename: string;
      width: number;
      height: number;
      storage_key_preview: string;
      watermark_applied: boolean;
      sort_order: number;
      mime_type?: string | null;
      file_size_bytes?: number | null;
    }
  >();

  if (logicalFull.error && isMissingSchemaObjectError(logicalFull.error)) {
    const logicalFallback = await supabase
      .from("gallery_assets")
      .select("id,filename,width,height,storage_key_preview,watermark_applied,sort_order")
      .eq("gallery_id", galleryId)
      .eq("is_active", true)
      .in("filename", candidateFilenames);

    if (logicalFallback.error) {
      return fail("DB_ERROR", logicalFallback.error.message, 500);
    }

    existingLogicalMap = new Map(
      logicalFallback.data.map((asset) => [
        toLogicalAssetKey({
          filename: asset.filename,
          width: asset.width,
          height: asset.height,
        }),
        asset,
      ]),
    );
  } else if (logicalFull.error) {
    return fail("DB_ERROR", logicalFull.error.message, 500);
  } else {
    existingLogicalMap = new Map(
      logicalFull.data.map((asset) => [
        toLogicalAssetKey({
          filename: asset.filename,
          mimeType: asset.mime_type,
          fileSizeBytes: asset.file_size_bytes,
          width: asset.width,
          height: asset.height,
        }),
        asset,
      ]),
    );
  }

  const logicalKeysInBatch = new Set<string>();
  const storageKeysToCleanup: string[] = [];
  const existingAssetsForResponse: Array<{
    id: string;
    filename: string;
    width: number;
    height: number;
    storage_key_preview: string;
    watermark_applied: boolean;
    sort_order: number;
  }> = [];
  const rowsToInsert = preparedFiles.reduce<
    Array<{
      gallery_id: string;
      filename: string;
      mime_type: string;
      file_size_bytes: number;
      width: number;
      height: number;
      storage_key_original: string;
      storage_key_preview: string;
      watermark_applied: boolean;
      sort_order: number;
      is_active: boolean;
    }>
  >((acc, file) => {
    const existingByStorageAsset = existingMap.get(file.storageKeyOriginal);
    if (existingByStorageAsset) {
      existingAssetsForResponse.push({
        id: existingByStorageAsset.id,
        filename: existingByStorageAsset.filename,
        width: existingByStorageAsset.width,
        height: existingByStorageAsset.height,
        storage_key_preview: existingByStorageAsset.storage_key_preview,
        watermark_applied: existingByStorageAsset.watermark_applied,
        sort_order: existingByStorageAsset.sort_order,
      });
      return acc;
    }

    const logicalKey = toLogicalAssetKey({
      filename: file.filename,
      mimeType: file.mimeType,
      fileSizeBytes: file.fileSizeBytes,
      width: file.width,
      height: file.height,
    });

    const existingLogicalAsset = existingLogicalMap.get(logicalKey);
    if (existingLogicalAsset || logicalKeysInBatch.has(logicalKey)) {
      storageKeysToCleanup.push(file.storageKeyOriginal, file.storageKeyPreview);
      if (existingLogicalAsset) {
        existingAssetsForResponse.push({
          id: existingLogicalAsset.id,
          filename: existingLogicalAsset.filename,
          width: existingLogicalAsset.width,
          height: existingLogicalAsset.height,
          storage_key_preview: existingLogicalAsset.storage_key_preview,
          watermark_applied: existingLogicalAsset.watermark_applied,
          sort_order: existingLogicalAsset.sort_order,
        });
      }
      return acc;
    }

    logicalKeysInBatch.add(logicalKey);
    acc.push({
      gallery_id: galleryId,
      filename: file.filename,
      mime_type: file.mimeType,
      file_size_bytes: file.fileSizeBytes,
      width: file.width,
      height: file.height,
      storage_key_original: file.storageKeyOriginal,
      storage_key_preview: file.storageKeyPreview,
      watermark_applied: file.watermarkApplied,
      sort_order: acc.length + offset,
      is_active: true,
    });
    return acc;
  }, []);

  let insertedAssets: Array<{
    id: string;
    filename: string;
    width: number;
    height: number;
    storage_key_preview: string;
    watermark_applied: boolean;
    sort_order: number;
  }> = [];

  if (rowsToInsert.length > 0) {
    const insert = await supabase
      .from("gallery_assets")
      .insert(rowsToInsert)
      .select("id,filename,width,height,storage_key_preview,watermark_applied,sort_order")
      .order("sort_order", { ascending: true });

    if (insert.error) {
      const bucketName = getAssetsBucketName();
      const keysToRemove = rowsToInsert.flatMap((row) => [row.storage_key_original, row.storage_key_preview]);
      const cleanup = await supabase.storage.from(bucketName).remove(keysToRemove);

      return fail("DB_ERROR", insert.error.message, 500, {
        cleanupOk: !cleanup.error,
        cleanupError: cleanup.error?.message ?? null,
      });
    }

    insertedAssets = insert.data;
  }

  if (storageKeysToCleanup.length > 0) {
    const bucketName = getAssetsBucketName();
    await supabase.storage.from(bucketName).remove(storageKeysToCleanup);
  }

  const touchGallery = await supabase
    .from("galleries")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", galleryId)
    .eq("photographer_id", auth.photographerId);

  if (touchGallery.error) {
    return fail("DB_ERROR", touchGallery.error.message, 500);
  }

  const responseAssets = [...existingAssetsForResponse, ...insertedAssets]
    .sort((a, b) => a.sort_order - b.sort_order)
    .filter((asset, index, all) => all.findIndex((entry) => entry.id === asset.id) === index);

  return ok(
    {
      projectId: galleryId,
      uploaded: insertedAssets.length,
      alreadyPresent: existingAssetsForResponse.length,
      assets: responseAssets.map((asset) => ({
        id: asset.id,
        filename: asset.filename,
        width: asset.width,
        height: asset.height,
        previewKey: asset.storage_key_preview,
        watermark: asset.watermark_applied,
      })),
    },
    201,
  );
}
