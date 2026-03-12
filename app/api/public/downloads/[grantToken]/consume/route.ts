import { fail, ok } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase";

type RouteContext = {
  params: Promise<{ grantToken: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { grantToken } = await context.params;
  const supabase = createAdminClient();

  const grant = await supabase
    .from("download_grants")
    .select("id,order_item_asset_id,expires_at,download_limit,download_count")
    .eq("token", grantToken)
    .maybeSingle();

  if (grant.error) {
    return fail("DB_ERROR", grant.error.message, 500);
  }

  if (!grant.data) {
    return fail("DOWNLOAD_GRANT_INVALID", "Grant not found", 404);
  }

  if (new Date(grant.data.expires_at).getTime() <= Date.now()) {
    return fail("DOWNLOAD_GRANT_EXPIRED", "Grant expired", 410);
  }

  if (grant.data.download_count >= grant.data.download_limit) {
    return fail("DOWNLOAD_LIMIT_REACHED", "Download limit reached", 409);
  }

  const orderItemAsset = await supabase
    .from("order_item_assets")
    .select("asset_id")
    .eq("id", grant.data.order_item_asset_id)
    .maybeSingle();

  if (orderItemAsset.error) {
    return fail("DB_ERROR", orderItemAsset.error.message, 500);
  }

  if (!orderItemAsset.data) {
    return fail("INVALID_ASSET_SELECTION", "Asset mapping not found", 404);
  }

  const asset = await supabase
    .from("gallery_assets")
    .select("id,filename,storage_key_original")
    .eq("id", orderItemAsset.data.asset_id)
    .maybeSingle();

  if (asset.error) {
    return fail("DB_ERROR", asset.error.message, 500);
  }

  if (!asset.data) {
    return fail("INVALID_ASSET_SELECTION", "Asset not found", 404);
  }

  const update = await supabase
    .from("download_grants")
    .update({
      download_count: grant.data.download_count + 1,
      last_downloaded_at: new Date().toISOString(),
    })
    .eq("id", grant.data.id)
    .eq("download_count", grant.data.download_count);

  if (update.error) {
    return fail("DB_ERROR", update.error.message, 500);
  }

  const eventInsert = await supabase.from("download_events").insert({
    grant_id: grant.data.id,
    user_agent: request.headers.get("user-agent"),
  });

  if (eventInsert.error) {
    return fail("DB_ERROR", eventInsert.error.message, 500);
  }

  return ok({
    assetId: asset.data.id,
    filename: asset.data.filename,
    storageKey: asset.data.storage_key_original,
    note: "Use this storage key to generate a short-lived signed URL from your storage provider.",
  });
}
