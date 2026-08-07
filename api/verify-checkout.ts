import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";

function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const sessionId = req.query.session_id as string | undefined;
  if (!sessionId) {
    res.status(400).json({ error: "session_id is required" });
    return;
  }

  const stripe = stripeClient();
  if (!stripe) {
    res.status(503).json({ error: "Stripe is not configured" });
    return;
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const active =
      session.status === "complete" && session.payment_status === "paid";
    res.status(200).json({ active });
  } catch (err) {
    console.error("verify-checkout failed", err);
    res.status(500).json({ error: "Failed to verify checkout session" });
  }
}
