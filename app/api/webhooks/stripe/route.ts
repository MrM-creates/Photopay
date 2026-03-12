import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { fail, ok } from "@/lib/http";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

async function ensureDownloadGrants(supabase: SupabaseClient, orderId: string) {
  const orderItems = await supabase.from("order_items").select("id").eq("order_id", orderId);
  if (orderItems.error) throw new Error(orderItems.error.message);
  if (orderItems.data.length === 0) return;

  const orderItemAssets = await supabase
    .from("order_item_assets")
    .select("id")
    .in(
      "order_item_id",
      orderItems.data.map((item) => item.id),
    );

  if (orderItemAssets.error) throw new Error(orderItemAssets.error.message);
  if (orderItemAssets.data.length === 0) return;

  const orderItemAssetIds = orderItemAssets.data.map((entry) => entry.id);

  const existingGrants = await supabase
    .from("download_grants")
    .select("order_item_asset_id")
    .in("order_item_asset_id", orderItemAssetIds);

  if (existingGrants.error) throw new Error(existingGrants.error.message);

  const existingIds = new Set(existingGrants.data.map((entry) => entry.order_item_asset_id));
  const missingRows = orderItemAssetIds
    .filter((id) => !existingIds.has(id))
    .map((id) => ({ order_item_asset_id: id }));

  if (missingRows.length === 0) return;

  const insert = await supabase.from("download_grants").insert(missingRows);
  if (insert.error) throw new Error(insert.error.message);
}

function getNextStatus(event: Stripe.Event, session: Stripe.Checkout.Session) {
  if (event.type === "checkout.session.async_payment_succeeded") {
    return "paid" as const;
  }

  if (event.type === "checkout.session.async_payment_failed") {
    return "failed" as const;
  }

  if (event.type === "checkout.session.expired") {
    return "canceled" as const;
  }

  if (event.type === "checkout.session.completed") {
    if (session.payment_status === "paid") {
      return "paid" as const;
    }
    return null;
  }

  return null;
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return fail("PAYMENT_VERIFICATION_FAILED", "Missing stripe-signature header", 400);
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(body, signature, getStripeWebhookSecret());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook signature";
    return fail("PAYMENT_VERIFICATION_FAILED", message, 400);
  }

  if (!event.type.startsWith("checkout.session.")) {
    return ok({ received: true, ignored: true, eventType: event.type });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const orderId = session.metadata?.orderId ?? session.client_reference_id;

  if (!orderId) {
    return ok({ received: true, ignored: true, reason: "Missing orderId metadata" });
  }

  const nextStatus = getNextStatus(event, session);
  if (!nextStatus) {
    return ok({ received: true, ignored: true, eventType: event.type });
  }

  const supabase = createAdminClient();

  const orderQuery = await supabase
    .from("orders")
    .select("id,cart_id,payment_status")
    .eq("id", orderId)
    .maybeSingle();

  if (orderQuery.error) {
    return fail("DB_ERROR", orderQuery.error.message, 500);
  }

  if (!orderQuery.data) {
    return ok({ received: true, ignored: true, reason: "Order not found" });
  }

  const order = orderQuery.data;

  if (nextStatus === "paid") {
    if (order.payment_status !== "paid") {
      const updateOrder = await supabase
        .from("orders")
        .update({
          payment_status: "paid",
          payment_reference: session.id,
          paid_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      if (updateOrder.error) {
        return fail("DB_ERROR", updateOrder.error.message, 500);
      }
    }

    if (order.cart_id) {
      const updateCart = await supabase
        .from("carts")
        .update({ status: "checked_out" })
        .eq("id", order.cart_id);

      if (updateCart.error) {
        return fail("DB_ERROR", updateCart.error.message, 500);
      }
    }

    try {
      await ensureDownloadGrants(supabase, order.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate download grants";
      return fail("DB_ERROR", message, 500);
    }

    return ok({ received: true, orderId: order.id, paymentStatus: "paid" });
  }

  if (order.payment_status === "paid") {
    return ok({ received: true, ignored: true, reason: "Order already paid" });
  }

  const updateOrder = await supabase
    .from("orders")
    .update({
      payment_status: nextStatus,
      payment_reference: session.id,
      paid_at: null,
    })
    .eq("id", order.id);

  if (updateOrder.error) {
    return fail("DB_ERROR", updateOrder.error.message, 500);
  }

  if (order.cart_id) {
    const updateCart = await supabase
      .from("carts")
      .update({ status: "open" })
      .eq("id", order.cart_id);

    if (updateCart.error) {
      return fail("DB_ERROR", updateCart.error.message, 500);
    }
  }

  return ok({ received: true, orderId: order.id, paymentStatus: nextStatus });
}
