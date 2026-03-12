import { hash } from "bcryptjs";
import { z } from "zod";

import { ensureProjectContext, readPhotographerId } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase";

type RouteContext = {
  params: Promise<{ galleryId: string }>;
};

const publishSchema = z.object({
  accessPassword: z.string().min(6).max(128),
  neverAutoArchive: z.boolean().optional(),
  archiveAfterDays: z.number().int().min(7).max(3650).optional(),
});

export async function POST(request: Request, context: RouteContext) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const { galleryId } = await context.params;
  const projectContext = ensureProjectContext(request.headers, galleryId);
  if ("error" in projectContext) return projectContext.error;

  const payload = await request.json().catch(() => null);
  const parsed = publishSchema.safeParse(payload);

  const supabase = createAdminClient();

  let supportsLifecycleColumns = true;
  let galleryRow: {
    id: string;
    status: string;
    published_at: string | null;
    archive_after_days?: number | null;
    never_auto_archive?: boolean | null;
  } | null = null;

  const lifecycleGallery = await supabase
    .from("galleries")
    .select("id,status,published_at,archive_after_days,never_auto_archive")
    .eq("id", galleryId)
    .eq("photographer_id", auth.photographerId)
    .maybeSingle();

  if (lifecycleGallery.error?.code === "42703") {
    supportsLifecycleColumns = false;
    const fallbackGallery = await supabase
      .from("galleries")
      .select("id,status,published_at")
      .eq("id", galleryId)
      .eq("photographer_id", auth.photographerId)
      .maybeSingle();

    if (fallbackGallery.error) {
      return fail("DB_ERROR", fallbackGallery.error.message, 500);
    }

    galleryRow = fallbackGallery.data
      ? {
          id: fallbackGallery.data.id,
          status: fallbackGallery.data.status,
          published_at: fallbackGallery.data.published_at,
        }
      : null;
  } else if (lifecycleGallery.error) {
    return fail("DB_ERROR", lifecycleGallery.error.message, 500);
  } else {
    galleryRow = lifecycleGallery.data
      ? {
          id: lifecycleGallery.data.id,
          status: lifecycleGallery.data.status,
          published_at: lifecycleGallery.data.published_at,
          archive_after_days: lifecycleGallery.data.archive_after_days,
          never_auto_archive: lifecycleGallery.data.never_auto_archive,
        }
      : null;
  }

  if (!galleryRow) {
    return fail("GALLERY_NOT_FOUND", "Gallery not found", 404);
  }

  if (galleryRow.status === "published") {
    return ok({
      id: galleryRow.id,
      projectId: galleryRow.id,
      status: galleryRow.status,
      publishedAt: galleryRow.published_at,
      archiveAfterDays: supportsLifecycleColumns ? (galleryRow.archive_after_days ?? 90) : 90,
      neverAutoArchive: supportsLifecycleColumns ? Boolean(galleryRow.never_auto_archive) : false,
      idempotent: true,
    });
  }

  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid payload", 422, { issues: parsed.error.issues });
  }

  const neverAutoArchive = parsed.data.neverAutoArchive ?? false;
  const archiveAfterDays = parsed.data.archiveAfterDays ?? 90;
  const accessPasswordHash = await hash(parsed.data.accessPassword, 12);
  const updatePayload: {
    access_password_hash: string;
    status: "published";
    published_at: string;
    never_auto_archive?: boolean;
    archive_after_days?: number;
  } = {
    access_password_hash: accessPasswordHash,
    status: "published",
    published_at: new Date().toISOString(),
  };

  if (supportsLifecycleColumns) {
    updatePayload.never_auto_archive = neverAutoArchive;
    updatePayload.archive_after_days = archiveAfterDays;
  }

  let updatedRow: {
    id: string;
    status: string;
    published_at: string | null;
    archive_after_days?: number | null;
    never_auto_archive?: boolean | null;
  } | null = null;

  if (supportsLifecycleColumns) {
    const lifecycleUpdate = await supabase
      .from("galleries")
      .update(updatePayload)
      .eq("id", galleryId)
      .eq("photographer_id", auth.photographerId)
      .select("id,status,published_at,archive_after_days,never_auto_archive")
      .maybeSingle();

    if (lifecycleUpdate.error) {
      return fail("DB_ERROR", lifecycleUpdate.error.message, 500);
    }

    updatedRow = lifecycleUpdate.data
      ? {
          id: lifecycleUpdate.data.id,
          status: lifecycleUpdate.data.status,
          published_at: lifecycleUpdate.data.published_at,
          archive_after_days: lifecycleUpdate.data.archive_after_days,
          never_auto_archive: lifecycleUpdate.data.never_auto_archive,
        }
      : null;
  } else {
    const fallbackUpdate = await supabase
      .from("galleries")
      .update(updatePayload)
      .eq("id", galleryId)
      .eq("photographer_id", auth.photographerId)
      .select("id,status,published_at")
      .maybeSingle();

    if (fallbackUpdate.error) {
      return fail("DB_ERROR", fallbackUpdate.error.message, 500);
    }

    updatedRow = fallbackUpdate.data
      ? {
          id: fallbackUpdate.data.id,
          status: fallbackUpdate.data.status,
          published_at: fallbackUpdate.data.published_at,
        }
      : null;
  }

  if (!updatedRow) return fail("GALLERY_NOT_FOUND", "Gallery not found", 404);

  return ok({
    id: updatedRow.id,
    projectId: updatedRow.id,
    status: updatedRow.status,
    publishedAt: updatedRow.published_at,
    archiveAfterDays: supportsLifecycleColumns ? (updatedRow.archive_after_days ?? 90) : 90,
    neverAutoArchive: supportsLifecycleColumns ? Boolean(updatedRow.never_auto_archive) : false,
    idempotent: false,
  });
}
