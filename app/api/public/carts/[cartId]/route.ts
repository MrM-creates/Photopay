import { readCartToken } from "@/lib/auth";
import { fetchCart } from "@/lib/cart";
import { fail, ok } from "@/lib/http";
import { evaluateSelection } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase";

type RouteContext = {
  params: Promise<{ cartId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const auth = readCartToken(request.headers);
  if ("error" in auth) return auth.error;

  const { cartId } = await context.params;
  const supabase = createAdminClient();

  const cart = await fetchCart(supabase, cartId);
  if (!cart) {
    return fail("CART_NOT_FOUND", "Cart not found", 404);
  }

  if (cart.access_token !== auth.cartToken) {
    return fail("GALLERY_ACCESS_DENIED", "Invalid cart token", 401);
  }

  const itemsQuery = await supabase
    .from("cart_package_items")
    .select(
      "id,package_id,base_price_cents,included_count,allow_extra,extra_unit_price_cents,line_position",
    )
    .eq("cart_id", cart.id)
    .order("line_position", { ascending: true });

  if (itemsQuery.error) {
    return fail("DB_ERROR", itemsQuery.error.message, 500);
  }

  const items = itemsQuery.data;

  if (items.length === 0) {
    return ok({
      cartId: cart.id,
      status: cart.status,
      customerName: cart.customer_name,
      customerEmail: cart.customer_email,
      items: [],
      subtotalCents: 0,
      totalCents: 0,
      checkoutEligible: false,
    });
  }

  const selectionsQuery = await supabase
    .from("cart_package_selections")
    .select("cart_package_item_id,asset_id")
    .in(
      "cart_package_item_id",
      items.map((item) => item.id),
    );

  if (selectionsQuery.error) {
    return fail("DB_ERROR", selectionsQuery.error.message, 500);
  }

  const packageNamesQuery = await supabase
    .from("packages")
    .select("id,name")
    .in(
      "id",
      items.map((item) => item.package_id),
    );

  if (packageNamesQuery.error) {
    return fail("DB_ERROR", packageNamesQuery.error.message, 500);
  }

  const packageNameById = new Map(packageNamesQuery.data.map((entry) => [entry.id, entry.name]));

  const selectedAssetsByItem = new Map<string, string[]>();
  for (const row of selectionsQuery.data) {
    const list = selectedAssetsByItem.get(row.cart_package_item_id) ?? [];
    list.push(row.asset_id);
    selectedAssetsByItem.set(row.cart_package_item_id, list);
  }

  const evaluatedItems = items.map((item) => {
    const selectedAssetIds = selectedAssetsByItem.get(item.id) ?? [];
    const selectedCount = selectedAssetIds.length;
    const evaluation = evaluateSelection({
      selectedCount,
      includedCount: item.included_count,
      allowExtra: item.allow_extra,
      basePriceCents: item.base_price_cents,
      extraUnitPriceCents: item.extra_unit_price_cents,
    });

    return {
      cartPackageItemId: item.id,
      packageId: item.package_id,
      packageName: packageNameById.get(item.package_id) ?? "Package",
      selectedAssetIds,
      basePriceCents: item.base_price_cents,
      extraUnitPriceCents: item.extra_unit_price_cents,
      ...evaluation,
    };
  });

  const subtotalCents = evaluatedItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const checkoutEligible = evaluatedItems.length > 0 && evaluatedItems.every((item) => item.checkoutEligible);

  return ok({
    cartId: cart.id,
    status: cart.status,
    customerName: cart.customer_name,
    customerEmail: cart.customer_email,
    items: evaluatedItems,
    subtotalCents,
    totalCents: subtotalCents,
    checkoutEligible,
  });
}
