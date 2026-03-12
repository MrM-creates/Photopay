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
  accessPassword: z.string().min(6).max(128),
});

export async function GET(request: Request) {
  const auth = readPhotographerId(request.headers);
  if ("error" in auth) return auth.error;

  const supabase = createAdminClient();

  const galleriesQuery = await supabase
    .from("galleries")
    .select("id,title,description,public_slug,status,published_at,cover_asset_id,created_at")
    .eq("photographer_id", auth.photographerId)
    .order("created_at", { ascending: false });

  if (galleriesQuery.error) {
    return fail("DB_ERROR", galleriesQuery.error.message, 500);
  }

  const galleryIds = galleriesQuery.data.map((gallery) => gallery.id);
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
    galleries: galleriesQuery.data.map((gallery) => ({
      id: gallery.id,
      title: gallery.title,
      description: gallery.description,
      publicSlug: gallery.public_slug,
      status: gallery.status,
      publishedAt: gallery.published_at,
      coverAssetId: gallery.cover_asset_id,
      createdAt: gallery.created_at,
      packageCount: packageCountByGallery.get(gallery.id) ?? 0,
      assetCount: assetCountByGallery.get(gallery.id) ?? 0,
    })),
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

  const accessPasswordHash = await hash(parsed.data.accessPassword, 12);
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
