import { z } from "zod";

import { readCartToken } from "@/lib/auth";
import { fetchCart } from "@/lib/cart";
import { fail, ok } from "@/lib/http";
import { evaluateSelection } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase";

const selectionsSchema = z.object({
  assetIds: z.array(z.string().uuid()).min(1),
});

type RouteContext = {
  params: Promise<{ cartId: string; cartPackageItemId: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const auth = readCartToken(request.headers);
  if ("error" in auth) return auth.error;

  const { cartId, cartPackageItemId } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = selectionsSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid payload", 422, {
      issues: parsed.error.issues,
    });
  }

  const uniqueAssetIds = [...new Set(parsed.data.assetIds)];
  const supabase = createAdminClient();

  const cart = await fetchCart(supabase, cartId);
  if (!cart) {
    return fail("CART_NOT_FOUND", "Cart not found", 404);
  }

  if (cart.access_token !== auth.cartToken) {
    return fail("GALLERY_ACCESS_DENIED", "Invalid cart token", 401);
  }

  const item = await supabase
    .from("cart_package_items")
    .select("id,cart_id,base_price_cents,included_count,allow_extra,extra_unit_price_cents")
    .eq("id", cartPackageItemId)
    .eq("cart_id", cart.id)
    .maybeSingle();

  if (item.error) {
    return fail("DB_ERROR", item.error.message, 500);
  }

  if (!item.data) {
    return fail("CART_ITEM_NOT_FOUND", "Cart package item not found", 404);
  }
  const itemData = item.data;

  if (!itemData.allow_extra && uniqueAssetIds.length > itemData.included_count) {
    return fail("EXTRA_NOT_ALLOWED", "This package does not allow extra images", 409);
  }

  const assets = await supabase
    .from("gallery_assets")
    .select("id")
    .eq("gallery_id", cart.gallery_id)
    .in("id", uniqueAssetIds);

  if (assets.error) {
    return fail("DB_ERROR", assets.error.message, 500);
  }

  if (assets.data.length !== uniqueAssetIds.length) {
    return fail("INVALID_ASSET_SELECTION", "One or more assets are invalid for this gallery", 409);
  }

  const removeOld = await supabase
    .from("cart_package_selections")
    .delete()
    .eq("cart_package_item_id", itemData.id);

  if (removeOld.error) {
    return fail("DB_ERROR", removeOld.error.message, 500);
  }

  const insertRows = uniqueAssetIds.map((assetId) => ({
    cart_package_item_id: itemData.id,
    asset_id: assetId,
  }));

  const insert = await supabase.from("cart_package_selections").insert(insertRows);
  if (insert.error) {
    return fail("DB_ERROR", insert.error.message, 500);
  }

  const evaluation = evaluateSelection({
    selectedCount: uniqueAssetIds.length,
    includedCount: itemData.included_count,
    allowExtra: itemData.allow_extra,
    basePriceCents: itemData.base_price_cents,
    extraUnitPriceCents: itemData.extra_unit_price_cents,
  });

  return ok(evaluation);
}
