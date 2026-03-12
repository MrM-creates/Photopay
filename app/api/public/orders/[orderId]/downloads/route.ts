import { readCartToken } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase";

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const auth = readCartToken(request.headers);
  if ("error" in auth) return auth.error;

  const { orderId } = await context.params;
  const supabase = createAdminClient();

  const order = await supabase
    .from("orders")
    .select("id,cart_id,payment_status")
    .eq("id", orderId)
    .maybeSingle();

  if (order.error) {
    return fail("DB_ERROR", order.error.message, 500);
  }

  if (!order.data) {
    return fail("ORDER_NOT_FOUND", "Order not found", 404);
  }

  if (!order.data.cart_id) {
    return fail("GALLERY_ACCESS_DENIED", "Order is not linked to a cart", 401);
  }

  const cart = await supabase
    .from("carts")
    .select("id,access_token")
    .eq("id", order.data.cart_id)
    .maybeSingle();

  if (cart.error) {
    return fail("DB_ERROR", cart.error.message, 500);
  }

  if (!cart.data || cart.data.access_token !== auth.cartToken) {
    return fail("GALLERY_ACCESS_DENIED", "Invalid cart token", 401);
  }

  if (order.data.payment_status !== "paid") {
    return fail("PAYMENT_NOT_COMPLETED", "Order is not paid", 409);
  }

  const orderItems = await supabase.from("order_items").select("id").eq("order_id", orderId);
  if (orderItems.error) {
    return fail("DB_ERROR", orderItems.error.message, 500);
  }

  if (orderItems.data.length === 0) {
    return ok({ orderId, items: [] });
  }

  const orderItemAssets = await supabase
    .from("order_item_assets")
    .select("id,asset_id")
    .in(
      "order_item_id",
      orderItems.data.map((item) => item.id),
    );

  if (orderItemAssets.error) {
    return fail("DB_ERROR", orderItemAssets.error.message, 500);
  }

  if (orderItemAssets.data.length === 0) {
    return ok({ orderId, items: [] });
  }

  const assets = await supabase
    .from("gallery_assets")
    .select("id,filename,storage_key_original")
    .in(
      "id",
      orderItemAssets.data.map((entry) => entry.asset_id),
    );

  if (assets.error) {
    return fail("DB_ERROR", assets.error.message, 500);
  }

  const grants = await supabase
    .from("download_grants")
    .select("token,expires_at,download_limit,download_count,order_item_asset_id")
    .in(
      "order_item_asset_id",
      orderItemAssets.data.map((entry) => entry.id),
    );

  if (grants.error) {
    return fail("DB_ERROR", grants.error.message, 500);
  }

  const assetById = new Map(assets.data.map((asset) => [asset.id, asset]));
  const assetIdByOrderItemAssetId = new Map(orderItemAssets.data.map((entry) => [entry.id, entry.asset_id]));

  const now = Date.now();
  const items = grants.data
    .filter((grant) => new Date(grant.expires_at).getTime() > now)
    .map((grant) => {
      const assetId = assetIdByOrderItemAssetId.get(grant.order_item_asset_id);
      const asset = assetId ? assetById.get(assetId) : null;
      if (!asset) return null;

      return {
        assetId: asset.id,
        filename: asset.filename,
        downloadUrl: `/api/public/downloads/${grant.token}/consume`,
        expiresAt: grant.expires_at,
        remainingDownloads: Math.max(0, grant.download_limit - grant.download_count),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return ok({ orderId, items });
}
