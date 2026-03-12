import Stripe from "stripe";

import { getEnv } from "@/lib/env";

const allowedMethodTypes = new Set<Stripe.Checkout.SessionCreateParams.PaymentMethodType>([
  "card",
  "twint",
  "alipay",
  "blik",
  "eps",
  "ideal",
  "klarna",
  "link",
  "sepa_debit",
]);

let stripeClient: Stripe | null = null;

export function getStripeClient() {
  const env = getEnv();

  if (!env.stripeSecretKey) {
    throw new Error("Missing required environment variable: STRIPE_SECRET_KEY");
  }

  if (!stripeClient) {
    stripeClient = new Stripe(env.stripeSecretKey);
  }

  return stripeClient;
}

export function getStripeWebhookSecret() {
  const env = getEnv();

  if (!env.stripeWebhookSecret) {
    throw new Error("Missing required environment variable: STRIPE_WEBHOOK_SECRET");
  }

  return env.stripeWebhookSecret;
}

export function getStripeCheckoutPaymentMethodTypes() {
  const env = getEnv();

  const methods = env.stripeCheckoutPaymentMethodTypes
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean) as Stripe.Checkout.SessionCreateParams.PaymentMethodType[];

  const filtered = methods.filter((method) => allowedMethodTypes.has(method));

  if (filtered.length === 0) {
    return ["twint", "card"] as Stripe.Checkout.SessionCreateParams.PaymentMethodType[];
  }

  return filtered;
}
