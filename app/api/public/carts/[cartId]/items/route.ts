import { z } from "zod";

import { readCartToken } from "@/lib/auth";
import { fetchCart } from "@/lib/cart";
import { fail, ok } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase";

const createItemSchema = z.object({
  packageId: z.string().uuid(),
});

type RouteContext = {
  params: Promise<{ cartId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const auth = readCartToken(request.headers);
  if ("error" in auth) return auth.error;

  const { cartId } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = createItemSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid payload", 422, {
      issues: parsed.error.issues,
    });
  }

  const supabase = createAdminClient();

  const cart = await fetchCart(supabase, cartId);
  if (!cart) {
    return fail("CART_NOT_FOUND", "Cart not found", 404);
  }

  if (cart.access_token !== auth.cartToken) {
    return fail("GALLERY_ACCESS_DENIED", "Invalid cart token", 401);
  }

  if (cart.status !== "open") {
    return fail("CART_NOT_OPEN", "Cart is not open", 409);
  }

  const pkg = await supabase
    .from("packages")
    .select("id,gallery_id,price_cents,included_count,allow_extra,extra_unit_price_cents,active")
    .eq("id", parsed.data.packageId)
    .maybeSingle();

  if (pkg.error) {
    return fail("DB_ERROR", pkg.error.message, 500);
  }

  if (!pkg.data || !pkg.data.active) {
    return fail("PACKAGE_NOT_FOUND", "Package not found", 404);
  }

  if (pkg.data.gallery_id !== cart.gallery_id) {
    return fail("INVALID_PACKAGE", "Package does not belong to this gallery", 409);
  }

  const itemCount = await supabase
    .from("cart_package_items")
    .select("id", { count: "exact", head: true })
    .eq("cart_id", cart.id);

  if (itemCount.error) {
    return fail("DB_ERROR", itemCount.error.message, 500);
  }

  const insert = await supabase
    .from("cart_package_items")
    .insert({
      cart_id: cart.id,
      package_id: pkg.data.id,
      base_price_cents: pkg.data.price_cents,
      included_count: pkg.data.included_count,
      allow_extra: pkg.data.allow_extra,
      extra_unit_price_cents: pkg.data.allow_extra ? pkg.data.extra_unit_price_cents : null,
      line_position: itemCount.count ?? 0,
    })
    .select("id,included_count,allow_extra,extra_unit_price_cents")
    .single();

  if (insert.error) {
    return fail("DB_ERROR", insert.error.message, 500);
  }

  return ok(
    {
      cartPackageItemId: insert.data.id,
      includedCount: insert.data.included_count,
      allowExtra: insert.data.allow_extra,
      extraUnitPriceCents: insert.data.extra_unit_price_cents,
    },
    201,
  );
}
