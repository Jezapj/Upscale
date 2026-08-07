import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";

function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const stripe = stripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    res.status(503).json({ error: "Stripe webhook is not configured" });
    return;
  }

  const sig = req.headers["stripe-signature"];
  if (!sig) {
    res.status(400).json({ error: "Missing stripe-signature" });
    return;
  }

  let event: Stripe.Event;
  try {
    const rawBody =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed", err);
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  // RevenueCat syncs Stripe subscriptions when connected in the RC dashboard.
  // This webhook logs lifecycle events for monitoring and future server-side sync.
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "checkout.session.completed":
      console.info(`Stripe webhook: ${event.type}`, event.id);
      break;
    default:
      break;
  }

  res.status(200).json({ received: true });
}
