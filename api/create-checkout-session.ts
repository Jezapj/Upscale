import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";

function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

function priceId(): string | null {
  return process.env.STRIPE_PRICE_ID ?? null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const stripe = stripeClient();
  const stripePriceId = priceId();
  if (!stripe || !stripePriceId) {
    res.status(503).json({ error: "Stripe is not configured" });
    return;
  }

  const { uid, email, returnUrl } = req.body as {
    uid?: string;
    email?: string;
    returnUrl?: string;
  };

  if (!uid) {
    res.status(400).json({ error: "uid is required" });
    return;
  }

  const origin = returnUrl ?? process.env.APP_URL ?? "http://localhost:5173";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: stripePriceId, quantity: 1 }],
      client_reference_id: uid,
      customer_email: email ?? undefined,
      metadata: { firebaseUid: uid },
      subscription_data: { metadata: { firebaseUid: uid } },
      success_url: `${origin}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}?checkout=cancel`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("create-checkout-session failed", err);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
}
