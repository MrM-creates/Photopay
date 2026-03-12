import { fail, ok } from "@/lib/http";
import { getAssetsBucketName } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase";

type RouteContext = {
  params: Promise<{ publicSlug: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { publicSlug } = await context.params;
  const supabase = createAdminClient();

  const galleryQuery = await supabase
    .from("galleries")
    .select("id,title,description,public_slug,status,published_at")
    .eq("public_slug", publicSlug)
    .maybeSingle();

  if (galleryQuery.error) {
    return fail("DB_ERROR", galleryQuery.error.message, 500);
  }

  if (!galleryQuery.data) {
    return fail("GALLERY_NOT_FOUND", "Gallery not found", 404);
  }

  if (galleryQuery.data.status !== "published") {
    return fail("GALLERY_NOT_AVAILABLE", "Gallery is not published", 409);
  }

  const assetsQuery = await supabase
    .from("gallery_assets")
    .select("id,filename,width,height,storage_key_preview,sort_order")
    .eq("gallery_id", galleryQuery.data.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (assetsQuery.error) {
    return fail("DB_ERROR", assetsQuery.error.message, 500);
  }

  const packagesQuery = await supabase
    .from("packages")
    .select("id,name,description,price_cents,included_count,allow_extra,extra_unit_price_cents,sort_order")
    .eq("gallery_id", galleryQuery.data.id)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (packagesQuery.error) {
    return fail("DB_ERROR", packagesQuery.error.message, 500);
  }

  const bucketName = getAssetsBucketName();
  const previewUrlByKey = new Map<string, string | null>();

  await Promise.all(
    assetsQuery.data.map(async (asset) => {
      const signed = await supabase.storage.from(bucketName).createSignedUrl(asset.storage_key_preview, 60 * 60);
      previewUrlByKey.set(asset.storage_key_preview, signed.error ? null : signed.data.signedUrl);
    }),
  );

  return ok({
    gallery: {
      id: galleryQuery.data.id,
      publicSlug: galleryQuery.data.public_slug,
      title: galleryQuery.data.title,
      description: galleryQuery.data.description,
      publishedAt: galleryQuery.data.published_at,
    },
    assets: assetsQuery.data.map((asset) => ({
      id: asset.id,
      filename: asset.filename,
      width: asset.width,
      height: asset.height,
      previewKey: asset.storage_key_preview,
      previewUrl: previewUrlByKey.get(asset.storage_key_preview) ?? null,
      watermark: true,
    })),
    packages: packagesQuery.data.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      priceCents: pkg.price_cents,
      includedCount: pkg.included_count,
      allowExtra: pkg.allow_extra,
      extraUnitPriceCents: pkg.extra_unit_price_cents,
    })),
  });
}
