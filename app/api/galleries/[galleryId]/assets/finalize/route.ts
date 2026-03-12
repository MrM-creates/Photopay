import { z } from "zod";

import { readPhotographerId } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
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
    .order("sort_order", { ascending: false })
    .limit(1);

  if (existingAssets.error) {
    return fail("DB_ERROR", existingAssets.error.message, 500);
  }

  const offset = existingAssets.data.length > 0 ? existingAssets.data[0].sort_order + 1 : 0;

  const rows = parsed.data.files.map((file, index) => {
    const uuid = crypto.randomUUID();

    return {
      gallery_id: galleryId,
      filename: file.filename,
      mime_type: file.mimeType,
      file_size_bytes: file.fileSizeBytes,
      width: file.width,
      height: file.height,
      storage_key_original: `orig/${galleryId}/${uuid}/${file.filename}`,
      storage_key_preview: `preview/${galleryId}/${uuid}/${file.filename}`,
      watermark_applied: true,
      sort_order: index + offset,
      is_active: true,
    };
  });

  const insert = await supabase
    .from("gallery_assets")
    .insert(rows)
    .select("id,filename,width,height,storage_key_preview,sort_order")
    .order("sort_order", { ascending: true });

  if (insert.error) {
    return fail("DB_ERROR", insert.error.message, 500);
  }

  return ok(
    {
      uploaded: insert.data.length,
      assets: insert.data.map((asset) => ({
        id: asset.id,
        filename: asset.filename,
        width: asset.width,
        height: asset.height,
        previewKey: asset.storage_key_preview,
        watermark: true,
      })),
    },
    201,
  );
}
