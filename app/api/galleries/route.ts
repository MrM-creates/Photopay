import { hash } from "bcryptjs";
import { z } from "zod";

import { readPhotographerId } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { toPublicSlug } from "@/lib/slug";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

const createGallerySchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
});

export async function GET(request: Request) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const supabase = createAdminClient();

  let supportsLifecycleColumns = true;
  const lifecycleQuery = await supabase
    .from("galleries")
    .select("id,title,description,public_slug,status,published_at,cover_asset_id,archive_after_days,never_auto_archive,created_at")
    .eq("photographer_id", auth.photographerId)
    .order("created_at", { ascending: false });

  let galleryRows: Array<{
    id: string;
    title: string;
    description: string | null;
    public_slug: string;
    status: string;
    published_at: string | null;
    cover_asset_id: string | null;
    archive_after_days?: number | null;
    never_auto_archive?: boolean | null;
    created_at: string;
  }> = [];

  if (lifecycleQuery.error?.code === "42703") {
    supportsLifecycleColumns = false;
    const fallbackQuery = await supabase
      .from("galleries")
      .select("id,title,description,public_slug,status,published_at,cover_asset_id,created_at")
      .eq("photographer_id", auth.photographerId)
      .order("created_at", { ascending: false });

    if (fallbackQuery.error) {
      return fail("DB_ERROR", fallbackQuery.error.message, 500);
    }

    galleryRows = fallbackQuery.data.map((row) => ({
      ...row,
      archive_after_days: 90,
      never_auto_archive: false,
    }));
  } else if (lifecycleQuery.error) {
    return fail("DB_ERROR", lifecycleQuery.error.message, 500);
  } else {
    galleryRows = lifecycleQuery.data;
  }

  const galleryIds = galleryRows.map((gallery) => gallery.id);
  if (galleryIds.length === 0) {
    return ok({ galleries: [] });
  }

  const [packagesQuery, assetsQuery] = await Promise.all([
    supabase
      .from("packages")
      .select("id,gallery_id,active")
      .in("gallery_id", galleryIds),
    supabase
      .from("gallery_assets")
      .select("id,gallery_id,is_active")
      .in("gallery_id", galleryIds),
  ]);

  if (packagesQuery.error) {
    return fail("DB_ERROR", packagesQuery.error.message, 500);
  }

  if (assetsQuery.error) {
    return fail("DB_ERROR", assetsQuery.error.message, 500);
  }

  const packageCountByGallery = new Map<string, number>();
  const assetCountByGallery = new Map<string, number>();

  for (const pkg of packagesQuery.data) {
    if (!pkg.active) continue;
    packageCountByGallery.set(pkg.gallery_id, (packageCountByGallery.get(pkg.gallery_id) ?? 0) + 1);
  }

  for (const asset of assetsQuery.data) {
    if (!asset.is_active) continue;
    assetCountByGallery.set(asset.gallery_id, (assetCountByGallery.get(asset.gallery_id) ?? 0) + 1);
  }

  return ok({
    galleries: galleryRows.map((row) => {
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        publicSlug: row.public_slug,
        status: row.status,
        publishedAt: row.published_at,
        coverAssetId: row.cover_asset_id,
        archiveAfterDays: supportsLifecycleColumns ? (row.archive_after_days ?? 90) : 90,
        neverAutoArchive: supportsLifecycleColumns ? Boolean(row.never_auto_archive) : false,
        createdAt: row.created_at,
        packageCount: packageCountByGallery.get(row.id) ?? 0,
        assetCount: assetCountByGallery.get(row.id) ?? 0,
      };
    }),
  });
}

export async function POST(request: Request) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const payload = await request.json().catch(() => null);
  const parsed = createGallerySchema.safeParse(payload);

  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid payload", 422, {
      issues: parsed.error.issues,
    });
  }

  const supabase = createAdminClient();
  const photographerId = auth.photographerId;

  const ensurePhotographer = await supabase.from("photographers").upsert(
    {
      id: photographerId,
      auth_user_id: photographerId,
      display_name: "Photographer",
    },
    {
      onConflict: "id",
    },
  );

  if (ensurePhotographer.error) {
    return fail("DB_ERROR", ensurePhotographer.error.message, 500);
  }

  const placeholderPassword = `draft-${crypto.randomUUID()}-${Date.now()}`;
  const accessPasswordHash = await hash(placeholderPassword, 12);
  const publicSlug = toPublicSlug(parsed.data.title);

  const insert = await supabase
    .from("galleries")
    .insert({
      photographer_id: photographerId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      public_slug: publicSlug,
      access_password_hash: accessPasswordHash,
      status: "draft",
    })
    .select("id,public_slug,status")
    .single();

  if (insert.error) {
    return fail("DB_ERROR", insert.error.message, 500);
  }

  return ok(
    {
      id: insert.data.id,
      publicSlug: insert.data.public_slug,
      status: insert.data.status,
    },
    201,
  );
}
