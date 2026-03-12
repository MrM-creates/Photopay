import { z } from "zod";

import { ensureProjectContext, readPhotographerId } from "@/lib/auth";
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

  const rowsToInsert = preparedFiles
    .filter((file) => !existingMap.has(file.storageKeyOriginal))
    .map((file, index) => ({
      gallery_id: galleryId,
      filename: file.filename,
      mime_type: file.mimeType,
      file_size_bytes: file.fileSizeBytes,
      width: file.width,
      height: file.height,
      storage_key_original: file.storageKeyOriginal,
      storage_key_preview: file.storageKeyPreview,
      watermark_applied: file.watermarkApplied,
      sort_order: index + offset,
      is_active: true,
    }));

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

  const existingAssetsForResponse = preparedFiles
    .map((file) => existingMap.get(file.storageKeyOriginal))
    .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))
    .map((asset) => ({
      id: asset.id,
      filename: asset.filename,
      width: asset.width,
      height: asset.height,
      storage_key_preview: asset.storage_key_preview,
      watermark_applied: asset.watermark_applied,
      sort_order: asset.sort_order,
    }));

  const responseAssets = [...existingAssetsForResponse, ...insertedAssets].sort((a, b) => a.sort_order - b.sort_order);

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
