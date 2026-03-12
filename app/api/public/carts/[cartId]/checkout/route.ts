import type Stripe from "stripe";

import { readCartToken } from "@/lib/auth";
import { fetchCart } from "@/lib/cart";
import { getEnv } from "@/lib/env";
import { fail, ok } from "@/lib/http";
import { evaluateSelection } from "@/lib/pricing";
import {
  getStripeCheckoutPaymentMethodTypes,
  getStripeClient,
} from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ cartId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const auth = readCartToken(request.headers);
  if ("error" in auth) return auth.error;

  const { cartId } = await context.params;
  const supabase = createAdminClient();
  const env = getEnv();

  if (env.paymentProvider !== "stripe") {
    return fail(
      "PAYMENT_PROVIDER_UNSUPPORTED",
      "Only Stripe checkout is implemented in this build",
      501,
    );
  }

  const cart = await fetchCart(supabase, cartId);
  if (!cart) {
    return fail("CART_NOT_FOUND", "Cart not found", 404);
  }

  if (cart.access_token !== auth.cartToken) {
    return fail("GALLERY_ACCESS_DENIED", "Invalid cart token", 401);
  }

  if (cart.status !== "open") {
    return fail("CHECKOUT_NOT_ELIGIBLE", "Cart is not open", 409);
  }

  const galleryQuery = await supabase
    .from("galleries")
    .select("id,photographer_id")
    .eq("id", cart.gallery_id)
    .maybeSingle();

  if (galleryQuery.error) {
    return fail("DB_ERROR", galleryQuery.error.message, 500);
  }

  if (!galleryQuery.data) {
    return fail("GALLERY_NOT_FOUND", "Gallery not found", 404);
  }

  const itemsQuery = await supabase
    .from("cart_package_items")
    .select("id,package_id,base_price_cents,included_count,allow_extra,extra_unit_price_cents")
    .eq("cart_id", cart.id);

  if (itemsQuery.error) {
    return fail("DB_ERROR", itemsQuery.error.message, 500);
  }

  if (itemsQuery.data.length === 0) {
    return fail("CHECKOUT_NOT_ELIGIBLE", "Cart has no items", 409);
  }

  const itemIds = itemsQuery.data.map((item) => item.id);

  const selectionsQuery = await supabase
    .from("cart_package_selections")
    .select("cart_package_item_id,asset_id")
    .in("cart_package_item_id", itemIds);

  if (selectionsQuery.error) {
    return fail("DB_ERROR", selectionsQuery.error.message, 500);
  }

  const packageNamesQuery = await supabase
    .from("packages")
    .select("id,name")
    .in(
      "id",
      itemsQuery.data.map((item) => item.package_id),
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

  const preparedItems = itemsQuery.data.map((item) => {
    const selectedAssetIds = selectedAssetsByItem.get(item.id) ?? [];
    const evaluation = evaluateSelection({
      selectedCount: selectedAssetIds.length,
      includedCount: item.included_count,
      allowExtra: item.allow_extra,
      basePriceCents: item.base_price_cents,
      extraUnitPriceCents: item.extra_unit_price_cents,
    });

    return {
      item,
      packageName: packageNameById.get(item.package_id) ?? "Package",
      selectedAssetIds,
      evaluation,
    };
  });

  if (!preparedItems.every((entry) => entry.evaluation.checkoutEligible)) {
    return fail("CHECKOUT_NOT_ELIGIBLE", "One or more package selections are incomplete", 409, {
      items: preparedItems.map((entry) => ({
        cartPackageItemId: entry.item.id,
        status: entry.evaluation.selectionStatus,
        message: entry.evaluation.message,
      })),
    });
  }

  const subtotalCents = preparedItems.reduce((sum, entry) => sum + entry.evaluation.lineTotalCents, 0);

  const orderInsert = await supabase
    .from("orders")
    .insert({
      gallery_id: cart.gallery_id,
      photographer_id: galleryQuery.data.photographer_id,
      cart_id: cart.id,
      currency: "CHF",
      subtotal_cents: subtotalCents,
      total_cents: subtotalCents,
      payment_provider: env.paymentProvider,
      payment_status: "pending",
    })
    .select("id,payment_provider,payment_status")
    .single();

  if (orderInsert.error) {
    return fail("DB_ERROR", orderInsert.error.message, 500);
  }

  for (const entry of preparedItems) {
    const orderItemInsert = await supabase
      .from("order_items")
      .insert({
        order_id: orderInsert.data.id,
        package_id: entry.item.package_id,
        package_name: entry.packageName,
        selected_count: entry.evaluation.selectedCount,
        included_count: entry.item.included_count,
        base_price_cents: entry.item.base_price_cents,
        allow_extra: entry.item.allow_extra,
        extra_unit_price_cents: entry.item.allow_extra ? entry.item.extra_unit_price_cents : null,
        extra_count: entry.evaluation.extraCount,
        extra_total_cents: entry.evaluation.extraCostCents,
        line_total_cents: entry.evaluation.lineTotalCents,
      })
      .select("id")
      .single();

    if (orderItemInsert.error) {
      return fail("DB_ERROR", orderItemInsert.error.message, 500);
    }

    if (entry.selectedAssetIds.length > 0) {
      const rows = entry.selectedAssetIds.map((assetId) => ({
        order_item_id: orderItemInsert.data.id,
        asset_id: assetId,
      }));

      const orderAssetsInsert = await supabase.from("order_item_assets").insert(rows);
      if (orderAssetsInsert.error) {
        return fail("DB_ERROR", orderAssetsInsert.error.message, 500);
      }
    }
  }

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = preparedItems.map((entry) => {
    const selectionSummary = `${entry.evaluation.selectedCount} Bild(er), inkl. ${entry.item.included_count}`;
    const extraSummary =
      entry.evaluation.extraCount > 0
        ? `, +${entry.evaluation.extraCount} Zusatzbild(er)`
        : "";

    return {
      quantity: 1,
      price_data: {
        currency: "chf",
        unit_amount: entry.evaluation.lineTotalCents,
        product_data: {
          name: entry.packageName,
          description: `${selectionSummary}${extraSummary}`,
        },
      },
    };
  });

  try {
    const stripe = getStripeClient();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      customer_email: cart.customer_email,
      payment_method_types: getStripeCheckoutPaymentMethodTypes(),
      client_reference_id: orderInsert.data.id,
      metadata: {
        orderId: orderInsert.data.id,
        cartId: cart.id,
        galleryId: cart.gallery_id,
      },
      success_url: `${env.appBaseUrl}/checkout/success?order_id=${orderInsert.data.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.appBaseUrl}/checkout/cancel?order_id=${orderInsert.data.id}`,
    });

    const orderUpdate = await supabase
      .from("orders")
      .update({ payment_reference: session.id })
      .eq("id", orderInsert.data.id);

    if (orderUpdate.error) {
      return fail("DB_ERROR", orderUpdate.error.message, 500);
    }

    const cartUpdate = await supabase
      .from("carts")
      .update({ status: "checkout_pending" })
      .eq("id", cart.id);

    if (cartUpdate.error) {
      return fail("DB_ERROR", cartUpdate.error.message, 500);
    }

    if (!session.url) {
      return fail("PAYMENT_SESSION_ERROR", "Stripe did not return a checkout URL", 502);
    }

    return ok({
      orderId: orderInsert.data.id,
      paymentProvider: orderInsert.data.payment_provider,
      paymentStatus: orderInsert.data.payment_status,
      checkoutUrl: session.url,
      stripeSessionId: session.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown stripe error";

    const orderUpdate = await supabase
      .from("orders")
      .update({ payment_status: "failed" })
      .eq("id", orderInsert.data.id);

    if (orderUpdate.error) {
      return fail("DB_ERROR", orderUpdate.error.message, 500);
    }

    return fail("PAYMENT_SESSION_ERROR", message, 502);
  }
}
