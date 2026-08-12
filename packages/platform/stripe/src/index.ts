import Stripe from "stripe";

export type { Stripe };

export function createStripeClient(secretKey = process.env.STRIPE_SECRET_KEY) {
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is required for Stripe access.");
  }

  return new Stripe(secretKey, {
    apiVersion: "2025-07-30.basil",
  });
}

export function getStripeWebhookSecret(secret = process.env.STRIPE_WEBHOOK_SECRET) {
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is required for Stripe webhook verification.");
  }

  return secret;
}
