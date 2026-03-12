import { z } from "zod";

import { ensureProjectContext, readPhotographerId } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { buildStorageKeys, ensureAssetsBucket, getAssetsBucketName } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

const widthSchema = z.coerce.number().int().min(1).max(20000).default(2400);
const heightSchema = z.coerce.number().int().min(1).max(20000).default(1600);

type RouteContext = {
  params: Promise<{ galleryId: string }>;
};

const maxUploadBytes = 35 * 1024 * 1024;

export async function POST(request: Request, context: RouteContext) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const { galleryId } = await context.params;
  const projectContext = ensureProjectContext(request.headers, galleryId);
  if ("error" in projectContext) return projectContext.error;

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

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return fail("VALIDATION_ERROR", "Missing file upload", 422);
  }

  if (file.size <= 0 || file.size > maxUploadBytes) {
    return fail("VALIDATION_ERROR", "File size is invalid", 422, {
      maxUploadBytes,
    });
  }

  const parsedWidth = widthSchema.safeParse(formData.get("width") ?? undefined);
  const parsedHeight = heightSchema.safeParse(formData.get("height") ?? undefined);

  if (!parsedWidth.success || !parsedHeight.success) {
    return fail("VALIDATION_ERROR", "Invalid image dimensions", 422);
  }

  try {
    await ensureAssetsBucket(supabase);
  } catch (error) {
    return fail("STORAGE_ERROR", error instanceof Error ? error.message : "Storage initialization failed", 500);
  }

  const bucketName = getAssetsBucketName();
  const keys = buildStorageKeys(galleryId, file.name);

  const upload = await supabase.storage.from(bucketName).upload(keys.originalKey, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (upload.error) {
    return fail("STORAGE_ERROR", upload.error.message, 500);
  }

  const previewUpload = await supabase.storage.from(bucketName).upload(keys.previewKey, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (previewUpload.error) {
    const cleanup = await supabase.storage.from(bucketName).remove([keys.originalKey]);
    return fail("STORAGE_ERROR", previewUpload.error.message, 500, {
      stage: "preview_upload",
      cleanupOk: !cleanup.error,
      cleanupError: cleanup.error?.message ?? null,
    });
  }

  return ok(
    {
      projectId: galleryId,
      file: {
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSizeBytes: file.size,
        width: parsedWidth.data,
        height: parsedHeight.data,
        storageKeyOriginal: keys.originalKey,
        storageKeyPreview: keys.previewKey,
        watermarkApplied: false,
      },
    },
    201,
  );
}
